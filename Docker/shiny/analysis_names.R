library(scales)
library(tidyverse)
library(RPostgres)
library(readxl)
library(bit64)
library(pool)
library(data.table)
library(fastDummies)
library(stargazer)
library(modelsummary)

DB_PASS<-Sys.getenv("DB_PASS")

export<-function(name){
  path.pdf<-paste("./Plots/",name,".pdf",sep="")
  path.png<-paste("./Plots/",name,".png",sep="")
  ggsave(path.pdf)
  ggsave(path.png)
}
export_raw<-function(name){
  path.pdf<-paste("./Plots/",name,".pdf",sep="")
  path.png<-paste("./Plots/",name,".png",sep="")
  dev.print(pdf, width=861, path.pdf)
  dev.print(png, width=861, path.png)
}

#Clean Latex output
cleanLatex<-function(text){
  text <- gsub("median\\\\_age", "Age", text)
  text <- gsub("median\\\\_gender", "Gender", text)
  text <- gsub("median\\\\_origin", "Origin", text)
  text <- gsub("candidates\\\\_city", "No. of Candidates", text)
  text <- gsub("log\\\\_population", "Log (Population)", text)
  text <- gsub("rel\\\\_pop\\\\_female\\\\_100", "Rel. Female Population", text)
  text <- gsub("rel\\\\_pop\\\\_foreign\\\\_100", "Rel. Foreign Population", text)
  text <- gsub("rel\\\\_income", "Income per Person", text)
  text <- gsub("rel\\\\_age\\\\_under40\\\\_100", "Rel. Population under 40", text)
  
  cat(text)
}



database <- dbPool(
  drv = dbDriver("Postgres"),
  dbname = "election",
  #host = "db",
  host = "localhost",
  user = "election",
  password = DB_PASS,
  idleTimeout = 3600000
)


election_date<-as.Date('2024-06-09')
election_type<-6

##Get all Election results
#Attention this will download some people duplicate if they are candidating on a combined list. 
query <- sqlInterpolate(conn=database, "
    SELECT er.*, ep.name, epf.party_family_id FROM election_result er
    LEFT JOIN elections e
    ON er.election_id = e.election_id
    AND er.rs = e.rs
    LEFT JOIN election_party ep
    ON ep.election_id = e.election_id
    AND ep.rs = e.rs
    AND er.party_id = ep.party_id
    FULL JOIN election_party_family epf
    ON e.rs = epf.rs
    AND e.election_id = epf.election_id
    AND er.party_id=epf.party_id
    WHERE e.date = ?date
    AND e.election_type = ?election_type
", date=election_date, election_type=election_type)

relevant_results_raw <- dbGetQuery(database, query)
setDT(relevant_results_raw)

##Get all Metadata for elections
query <- sqlInterpolate(conn=database, "
    SELECT e.*,c.name 
    FROM public.election_result_aggregate_meta_region e 
    RIGHT JOIN public.cities c 
    ON e.rs = c.rs  
    WHERE e.election_type = ?election_type
    AND e.date=?date
", date=election_date, election_type=election_type)

election_cities_meta <- dbGetQuery(database, query)
setDT(election_cities_meta)

##Get all Party Families
query <- sqlInterpolate(conn=database, "
    SELECT * from party")

election_party_family <- dbGetQuery(database, query)
setDT(election_party_family)

##Get all Name analysis entries
query <- paste0("SELECT * from analysis_name")
analysis_name_raw <- dbGetQuery(database, query)

##Get all elected members
query <- sqlInterpolate(conn=database, "
    SELECT * 
    FROM election_elected_candidates
    WHERE election_type = ?election_type
    AND date=?date
", date=election_date, election_type=election_type)
elected_names_raw <- dbGetQuery(database, query)
#Tidy the name
elected_names_raw <- elected_names_raw %>%
  mutate(candidate_name = sub("^(Dr\\. |Prof\\. |Prof\\. Dr\\. )?(.*),\\s*(.*)$", "\\1\\3 \\2", name))



#get all cities
query <- paste0("SELECT * from cities")
cities <- dbGetQuery(database, query)
setDT(cities)

##Get Variance analysis
query <- sqlInterpolate(conn=database, "
    SELECT av.* 
    FROM analysis_variance av
    WHERE av.date = ?date 
    AND av.election_type = ?election_type
", date=election_date, election_type=election_type)

party_variances <- dbGetQuery(database, query)

##get some additional metadata
metadata_income<-read_xlsx("./data/income.xlsx")
colnames(metadata_income)<-c("ags","name","number_of_taxpayers","income","income_tax")
metadata_income<-metadata_income%>%filter(str_starts(as.character(ags), "08"))%>%mutate(ags=as.integer64(str_pad(ags, width = 8, side = "right", pad = "0")))
metadata_unemployment<-read_xlsx("./data/unemployment.xlsx")
colnames(metadata_unemployment)<-c("ags","name","unemployed","unemployed_forigners","unemployed_disabled","unemployed_15-20","unemployed_15-25","unemployed_55-65","unemployed_long_time")
metadata_unemployment<-metadata_unemployment%>%filter(str_starts(as.character(ags), "08"))%>%mutate(ags=as.integer64(str_pad(ags, width = 8, side = "right", pad = "0")))
metadata_demographics<-read_xlsx("./data/Regionaltabelle_Demografie.xlsx",sheet = "CSV-Demografie")
colnames(metadata_demographics) <- c(
  "census_date", "rs", "name", "region_level",
  "pop_total", "pop_male", "pop_female",
  "pop_national", "pop_foreign",
  "pop_age_0_2", "pop_age_3_5", "pop_age_6_9", "pop_age_10_15",
  "pop_age_16_18", "pop_age_19_24", "pop_age_25_39", "pop_age_40_59",
  "pop_age_60_66", "pop_age_67_74", "pop_age_75_plus",
  "pop_single", "pop_married", "pop_widowed", "pop_divorced", "pop_famstatus_na",
  "pop_migration_total", "pop_migrated", "pop_descendants",
  "pop_migration_half", "pop_no_migration"
)
metadata_demographics<-metadata_demographics%>%filter(str_starts(as.character(rs), "08"))%>%mutate(rs=as.integer64(str_pad(rs, width = 12, side = "right", pad = "0")))


##cobine the metadata all together into one big table
cities_metadata<-cities%>%left_join(metadata_income%>%select(-name))%>%left_join(metadata_unemployment%>%select(-name))%>%left_join(metadata_demographics%>%select(-census_date,-name,-region_level)%>%unique())

#make dummy variables for the party families
relevant_results_party_families<-relevant_results_raw%>%select(rs,party_id,party_family_id,name)%>%unique()%>%
  mutate(party_family_id = replace_na(party_family_id, 0))%>%
  dummy_cols(select_columns = "party_family_id", 
             remove_first_dummy = FALSE, 
             remove_selected_columns = TRUE) %>%
  group_by(rs, party_id, name) %>%
  summarise(across(starts_with("party_family_id_"), max), .groups = "drop")


##Delete some entries, that are also documented in the tesis

#First all Candidates from Wangen (rs 81175005055) that are not from a list
relevant_results<-relevant_results_raw %>% 
  filter(rs != '81175005055' | party_id == 1)
#Do it also for Candidates from Bühlerzell (rs 81275007013) that are not from a list
relevant_results<-relevant_results %>% 
  filter(rs != '81275007013' | party_id == 1)
#Do it also for Candidates from Bartholomä (rs 81365006007) that are not from a list
relevant_results<-relevant_results %>% 
  filter(rs != '81365006007' | party_id == 1)
#Do it also for Candidates from Fluorn-Winzeln (rs 83255002070) that are not from a list
relevant_results<-relevant_results %>% 
  filter(rs != '83255002070' | party_id == 1)
#Do it also for Candidates from Böttingen (rs 83275004006) that are not from a list
relevant_results<-relevant_results %>% 
  filter(rs != '83275004006' | party_id == 1)
#Do it also for Candidates from Dürbheim (rs 83275004011) that are not from a list
relevant_results<-relevant_results %>% 
  filter(rs != '83275004011' | party_id == 1)
#Do it also for Candidates from Gütenbach (rs 83265002020) that are not from a list
relevant_results<-relevant_results %>% 
  filter(rs != '83265002020' | party_id == 1)
#Do it also for Candidates from Grosselfingen (rs 84175003023) that are not from a list
relevant_results<-relevant_results %>% 
  filter(rs != '84175003023' | party_id == 1)
#Do it also for Candidates from Bad Buchau (rs 84265001013) that are not from a list
relevant_results<-relevant_results %>% 
  filter(rs != '84265001013' | party_id == 1)
#Do it also for Candidates from Fleischwangen (rs 84365001032) that are not from a list
relevant_results<-relevant_results %>% 
  filter(rs != '84365001032' | party_id == 1)
#Lastly delete all entries where the Party name is 'Freie Zeile' or it is NA
relevant_results<-relevant_results %>% 
  filter(tolower(name) != 'freie zeile' & !is.na(name))

#Delete all duplicate entries and also delete the Party family, as this does not have any meaning than
relevant_results_unique<- relevant_results %>% select(-party_family_id) %>% unique()
##Add the information up for municipality level
relevant_results_unique_city<-relevant_results_unique%>%group_by(rs,election_id,party_id,candidate_name,name)%>%summarise(vote_count = sum(vote_count, na.rm = TRUE))%>%ungroup()

##Only keep names in the analysis_name that are still in the database
analysis_name_median<-analysis_name_raw%>%group_by(election_type,date,rs,ai_model,candidate_name,party_id)%>%summarise(median_age=median(candidate_age ),sd_age=sd(candidate_age ),median_gender=median(candidate_gender),sd_gender=sd(candidate_gender),median_origin=median(candidate_origin),sd_origin=sd(candidate_origin))%>%ungroup()
analysis_name_clean<-analysis_name_median%>%right_join(relevant_results_unique_city%>%select(rs,candidate_name,party_id))
##Show how many People have a mean age of below 16 or over 90
analysis_name_clean%>%filter(!between(median_age,16,89))%>%nrow()
##Filter them out
analysis_name_clean<-analysis_name_clean%>%filter(between(median_age,16,89))



##Calculate the number of Candidates on each list, the number of candidates in the municipality and the voteshare calculates on a Municipality level
#First join Tables
relevant_results_unique_city_meta<-relevant_results_unique_city%>%left_join(election_cities_meta%>%select(-name,-votetype_id),join_by("rs"))
#Calculate number of Candidates per list
relevant_results_unique_city_meta<-relevant_results_unique_city_meta%>%group_by(rs,election_id,party_id,name) %>% add_count(name = "candidates_list") %>% ungroup()
#Calculate number of Candidates per city
relevant_results_unique_city_meta<-relevant_results_unique_city_meta%>%group_by(rs,election_id) %>% add_count(name = "candidates_city") %>% ungroup()
#Calculate Percentage 
relevant_results_unique_city_meta<-relevant_results_unique_city_meta%>%mutate(vote_percentage=vote_count/votes_cast)


#Boxberg is not included as it has 2 Persons named Volker Weber on one List
#Hayingen is not included as it has 2 Persons named Achim Geiselhart on one List
#Altheim (Landkreis Alb-Donau-Kreis) is not included, as it has no data on elected Persons

#Some of the variables in cities_metadata have to be relative on the population

cities_metadata_rel <- cities_metadata %>%
  mutate(across(
    c(population:number_of_taxpayers, income:pop_no_migration), 
    ~ as.numeric(.) / as.numeric(pop_total), 
    .names = "rel_{.col}"
  ))

##And do a log of population
cities_metadata_rel <- cities_metadata_rel%>%mutate(log_population=log(population))

##do the final table for the gmm
relevant_results_gmm<-relevant_results_unique_city_meta%>%select(-vote_count,-election_type,-valid_ballots,-date)%>%
  right_join(analysis_name_clean%>%select(-election_type,-date))%>%
  left_join(cities_metadata_rel%>%select(-name,-ags))%>%
  left_join(relevant_results_party_families)%>%
  left_join(party_variances%>%select(-election_type,-date,-ps_id))
colnames(relevant_results_gmm)

##Do some plots
ggplot(relevant_results_gmm, aes(y = vote_percentage*100 , x = factor(median_gender))) +
  geom_boxplot() +
  theme_minimal() +
  labs(y = "Voteshare in %", x = "Median Gender (1 being Male; 10 being female)", color = "Party")+
  theme(legend.position = "bottom", legend.title = element_text(size = 12))
export("07_vote_gender")

#Tell me the means for all the genders
relevant_results_gmm%>%select(vote_percentage,median_gender)%>%group_by(median_gender)%>%summarise(mean(vote_percentage))

ggplot(relevant_results_gmm, aes(y = vote_percentage*100 , x = factor(median_origin))) +
  geom_boxplot() +
  theme_minimal() +
  labs(y = "Voteshare in %", x = "Median Ethnicity (1 being German)", color = "Party")+
  theme(legend.position = "bottom", legend.title = element_text(size = 12))
export("08_vote_origin")

# Create age groups
relevant_results_gmm_plot <- relevant_results_gmm %>%
  mutate(age_group = cut(median_age, 
                         breaks = seq(0, 90, by = 10), 
                         right = FALSE, 
                         labels = FALSE))
# Plot with age groups on the x-axis
ggplot(relevant_results_gmm_plot, aes(y = vote_percentage*100, x = factor(age_group))) +
  geom_boxplot() +
  theme_minimal() +
  labs(x = "Age Group", y = "Voteshare in %") +
  theme(legend.position = "bottom", legend.title = element_text(size = 12))+
  scale_x_discrete(labels = c("16-20","20-30","30-40","40-50","50-60","60-70","70-80","80+"))
export("09_vote_age")


##Simple linear regression

linear_model<-lm(vote_percentage*100 ~ 
     median_age + median_gender + median_origin, data = relevant_results_gmm)

summary(linear_model)
stargazer(linear_model)

linear_model<-lm(vote_percentage*100 ~ 
                   median_age + median_gender + median_origin + candidates_city, data = relevant_results_gmm)

summary(linear_model)
stargazer(linear_model)

##Run Model with individual Intercepts:
# Fit the multilevel model
model <- lmer(vote_percentage*100 ~ 
                median_age + median_gender + median_origin + candidates_city +
                (1 | rs), 
              data = relevant_results_gmm)

# View model summary
summary(model)
stargazer(model)
modelsummary(model,"latex_tabular")
texreg(model,stars = c(0.01, 0.05, 0.1),digits = 3)

##Run Model with individual Intercepts and slopes:

model_with_random_slopes <- lmer(vote_percentage*100 ~ 
                                   median_age + median_gender + median_origin + candidates_city + 
                                   (median_age + median_gender + median_origin + 1 | rs), 
                                 data = relevant_results_gmm)

# View the summary
summary(model_with_random_slopes)
texreg(model_with_random_slopes,stars = c(0.01, 0.05, 0.1),digits = 4)
# Combine both models into one table
texreg(list(model,model_with_random_slopes), 
       stars = c(0.01, 0.05, 0.1), 
       digits = 4)


##Model including some relationships
relevant_results_gmm <- relevant_results_gmm %>%
  mutate(
    rel_pop_female_100 = rel_pop_female * 100,
    rel_pop_foreign_100 = rel_pop_foreign * 100,
    rel_unemployed_100 = rel_unemployed *100,
    rel_age_under40_100 = rel_pop_age_0_2+rel_pop_age_3_5+rel_pop_age_6_9+rel_pop_age_10_15+rel_pop_age_16_18+rel_pop_age_19_24+rel_pop_age_25_39*100
  )

model_with_relationships <- lmer(vote_percentage*100 ~ 
                                   median_age + median_gender + median_origin + candidates_city + 
                                   median_gender * log_population +
                                   median_origin * log_population +
                                   median_gender * rel_pop_female_100 +
                                   median_origin * rel_pop_female_100 +
                                   median_gender * rel_pop_foreign_100 +
                                   median_origin * rel_pop_foreign_100 +
                                   median_gender * rel_income +
                                   median_origin * rel_income +
                                   median_gender * rel_age_under40_100 +
                                   median_origin * rel_age_under40_100 +
                                   
                                   (1 | rs), 
                                 data = relevant_results_gmm)
summary(model_with_relationships)
text<-texreg(model_with_relationships,stars = c(0.01, 0.05, 0.1),digits = 4)
texreg(model_with_relationships,stars = c(0.01, 0.05, 0.1),digits = 4)%>%cleanLatex()


##Do the GMM

# Define Matrix
x <- model.matrix(~ median_age + median_gender + median_origin +
                    log_population + candidates_city,
                  data = relevant_results_gmm)
y <- relevant_results_gmm$vote_percentage*100

# Define the Momentcondition
moment_function <- function(theta, data) {
  x <- data$x
  y <- data$y
  resid <- y - x %*% theta
  return(as.vector(resid) * x)
}

data_gmm <- list(x = x, y = y)

#Starting value
theta0 <- rep(0, ncol(x))

#Execute
gmm_model <- gmm(g = moment_function, x = data_gmm, t0 = theta0)
summary(gmm_model)
texreg(gmm_model)
stargazer(gmm_model)


##GMM with non linar Momentcondition

##Do the GMM

# Define Matrix
x <- model.matrix(~ median_age + median_gender + median_origin +
                    log_population + candidates_city,
                  data = relevant_results_gmm)
y <- relevant_results_gmm$vote_percentage*100

# Definiere die Momentcondition
moment_function <- function(theta, data) {
  x <- data$x
  y <- data$y
  
  y_hat <- theta[1] +  
    theta[2] * exp(theta[3] * x[, "median_age"]) +  
    theta[4] * x[, "median_gender"] +  
    theta[5] * x[, "median_origin"] +  
    theta[6] * x[, "log_population"]
  
  
  # Compute residuals
  resid <- y - y_hat
  
  # Moment conditions: residuals multiplied by x (orthogonality condition)
  return(as.vector(resid) * x)
}


data_gmm <- list(x = x, y = y)

#Starting value
theta0 <- theta0 <- c(5, 0.01, -0.001, 0.1, -0.05, -0.5)  # Adjust based on expected effects


#Execute
gmm_model <- gmm(g = moment_function, x = data_gmm, t0 = theta0)
summary(gmm_model)
texreg(gmm_model)
stargazer(gmm_model)




##Mache ein OLS pro (relevanter) Partei
#CDU
linear_model_CDU<-lm(vote_percentage*100 ~ 
                   median_age + median_gender + median_origin + candidates_city, data = relevant_results_gmm%>%filter(party_family_id_1==1))

summary(linear_model_CDU)
stargazer(linear_model_CDU)

#GRÜNE
linear_model_GRÜNE<-lm(vote_percentage*100 ~ 
                       median_age + median_gender + median_origin + candidates_city, data = relevant_results_gmm%>%filter(party_family_id_3==1))

summary(linear_model_GRÜNE)
stargazer(linear_model_GRÜNE)
#SPD
linear_model_SPD<-lm(vote_percentage*100 ~ 
                          median_age + median_gender + median_origin + candidates_city, data = relevant_results_gmm%>%filter(party_family_id_4==1))

summary(linear_model_SPD)
stargazer(linear_model_SPD)
#AfD
linear_model_AfD<-lm(vote_percentage*100 ~ 
                          median_age + median_gender + median_origin + candidates_city, data = relevant_results_gmm%>%filter(party_family_id_5==1))

summary(linear_model_AfD)
stargazer(linear_model_AfD)
#FDP
linear_model_FDP<-lm(vote_percentage*100 ~ 
                          median_age + median_gender + median_origin + candidates_city, data = relevant_results_gmm%>%filter(party_family_id_6==1))

summary(linear_model_FDP)
stargazer(linear_model_FDP)
#LINKE
linear_model_LINKE<-lm(vote_percentage*100 ~ 
                          median_age + median_gender + median_origin + candidates_city, data = relevant_results_gmm%>%filter(party_family_id_7==1))

summary(linear_model_LINKE)
stargazer(linear_model_LINKE)
#Freie Wähler
linear_model_Freie_Wähler<-lm(vote_percentage*100 ~ 
                          median_age + median_gender + median_origin + candidates_city, data = relevant_results_gmm%>%filter(party_family_id_50==1))

summary(linear_model_Freie_Wähler)
stargazer(linear_model_Freie_Wähler)

##Combined Stargazer
stargazer(linear_model_CDU,linear_model_GRÜNE,linear_model_SPD)
stargazer(linear_model_AfD,linear_model_FDP,linear_model_LINKE)
stargazer(linear_model_Freie_Wähler)


##OLS models for Stuttgart only
#All
lms_all<-lm(vote_percentage*100 ~ 
                       median_age + median_gender + median_origin
              , data = relevant_results_gmm%>%filter(rs==81110000000))

summary(lms_all)
#CDU
lms_CDU<-lm(vote_percentage*100 ~ 
                       median_age + median_gender + median_origin, data = relevant_results_gmm%>%filter(rs==81110000000,party_family_id_1==1))

summary(lms_CDU)
#GRÜNE
lms_GRÜNE<-lm(vote_percentage*100 ~ 
                         median_age + median_gender + median_origin, data = relevant_results_gmm%>%filter(rs==81110000000,party_family_id_3==1))

summary(lms_GRÜNE)
#SPD
lms_SPD<-lm(vote_percentage*100 ~ 
                       median_age + median_gender + median_origin, data = relevant_results_gmm%>%filter(rs==81110000000,party_family_id_4==1))

summary(lms_SPD)
#AfD
lms_AfD<-lm(vote_percentage*100 ~ 
                       median_age + median_gender + median_origin, data = relevant_results_gmm%>%filter(rs==81110000000,party_family_id_5==1))

summary(lms_AfD)
#FDP
lms_FDP<-lm(vote_percentage*100 ~ 
                       median_age + median_gender + median_origin, data = relevant_results_gmm%>%filter(rs==81110000000,party_family_id_6==1))

summary(lms_FDP)
#LINKE
lms_LINKE<-lm(vote_percentage*100 ~ 
                         median_age + median_gender + median_origin, data = relevant_results_gmm%>%filter(rs==81110000000,party_family_id_7==1))

summary(lms_LINKE)
#Freie Wähler
lms_Freie_Wähler<-lm(vote_percentage*100 ~ 
                                median_age + median_gender + median_origin, data = relevant_results_gmm%>%filter(rs==81110000000,party_family_id_50==1))

summary(lms_Freie_Wähler)
##Combined Stargazer
stargazer(lms_all,lms_CDU,lms_GRÜNE,lms_SPD)
stargazer(lms_AfD,lms_FDP,lms_LINKE)
stargazer(lms_Freie_Wähler)


t<-list("0"=lms_all,"1"=lms_CDU,"2"=lms_GRÜNE,"3"=lms_SPD,"4"=lms_AfD,"5"=lms_FDP,"6"=lms_LINKE,"7"=lms_Freie_Wähler)
stargazer(t)

####OLS model with interaction
#All
lms_interact<-lm(vote_percentage*100 ~ 
              median_age + median_gender + median_origin +
              median_age * median_gender +
              median_age * median_origin +
              median_gender * median_origin+
                candidates_city
            , data = relevant_results_gmm)
summary(lms_interact)
stargazer(lms_interact)%>%cleanLatex()



####OLS model with cv
#All
lms_cv<-lm(vote_percentage*100 ~ 
                   median_age + median_gender + median_origin +
             median_age * cv +
             median_gender * cv +
             median_origin * cv+
                   cv +
                   candidates_city
                 , data = relevant_results_gmm)
summary(lms_cv)
stargazer(lms_cv)%>%cleanLatex()




###All further code was not used for the thesis










X <- model.matrix(~ median_age + median_gender + median_origin + candidates_list + 
                    log_population + candidates_city + rel_income + rel_pop_foreign + rel_unemployed + 
                    median_age * log_population + median_gender * log_population + median_origin * log_population +
                    median_age * rel_income + median_gender * rel_income + median_origin * rel_income +
                    median_age * rel_pop_foreign + median_gender * rel_pop_foreign + median_origin * rel_pop_foreign +
                    median_age * rel_unemployed + median_gender * rel_unemployed + median_origin * rel_unemployed
                  ,
                  data = relevant_results_gmm)

y <- relevant_results_gmm$vote_percentage

moment_function_hierarchical <- function(theta, data) {
  X <- data$X
  y <- data$y
  rs <- data$rs
  party_id <- data$party_id
  
  # Fixd efects
  resid <- y - X %*% theta
  
  # group effects
  mean_resid_rs <- tapply(resid, rs, mean, na.rm = TRUE)
  mean_resid_party <- tapply(resid, party_id, mean, na.rm = TRUE)
  
  # Moments
  moments <- cbind(as.vector(resid) * X,  
                   mean_resid_rs[rs],   
                   mean_resid_party[party_id]) 
  
  return(moments)
}
theta0 <- rep(0, ncol(X))

data_gmm <- list(X = X, 
                 y = y, 
                 rs = as.factor(relevant_results_gmm$rs), 
                 party_id = as.factor(relevant_results_gmm$party_id))

gmm_model_hierarchical <- gmm(g = moment_function_hierarchical, 
                              x = data_gmm, 
                              t0 = theta0)

summary(gmm_model_hierarchical)



# Model matrix
X <- model.matrix(~ median_age + median_gender + median_origin + candidates_list + 
                    party_family_id_0 + party_family_id_1 + party_family_id_3 + party_family_id_4 + party_family_id_5 + party_family_id_6 + party_family_id_7 + party_family_id_8 + party_family_id_9 + party_family_id_10 + party_family_id_11 + party_family_id_12 + party_family_id_15 + party_family_id_17 + party_family_id_23 + party_family_id_25 + party_family_id_29 + party_family_id_34 + party_family_id_37 + party_family_id_50 + 
                    log_population + candidates_city + rel_income + rel_pop_foreign + rel_unemployed + 
                    median_age * log_population + median_gender * log_population + median_origin * log_population +
                    median_age * rel_income + median_gender * rel_income + median_origin * rel_income +
                    median_age * rel_pop_foreign + median_gender * rel_pop_foreign + median_origin * rel_pop_foreign +
                    median_age * rel_unemployed + median_gender * rel_unemployed + median_origin * rel_unemployed
                  ,
                  data = relevant_results_gmm)

y <- relevant_results_gmm$vote_percentage

moment_function_hierarchical <- function(theta, data) {
  X <- data$X
  y <- data$y
  rs <- data$rs
  party_id <- data$party_id
  
  # Fixed effects
  resid <- y - X %*% theta
  
  # group effects
  mean_resid_rs <- tapply(resid, rs, mean, na.rm = TRUE)
  mean_resid_party <- tapply(resid, party_id, mean, na.rm = TRUE)
  
  # Moments:
  moments <- cbind(as.vector(resid) * X,  
                   mean_resid_rs[rs],  
                   mean_resid_party[party_id]) 
  
  return(moments)
}
theta0 <- rep(0, ncol(X))

data_gmm <- list(X = X, 
                 y = y, 
                 rs = as.factor(relevant_results_gmm$rs), 
                 party_id = as.factor(relevant_results_gmm$party_id))

gmm_model_hierarchical <- gmm(g = moment_function_hierarchical, 
                              x = data_gmm, 
                              t0 = theta0)

summary(gmm_model_hierarchical)

