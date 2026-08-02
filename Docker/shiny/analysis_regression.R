library(tidyverse)
library(RPostgres)
library(fastDummies)
library(stargazer)

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

##Get all Party Families
query <- sqlInterpolate(conn=database, "
    SELECT * from party")

election_party_family <- dbGetQuery(database, query)
setDT(election_party_family)

#Get all the variance analysis
query <- sqlInterpolate(conn=database, "
    SELECT av.*, e.election_id, epf.party_family_id 
    FROM analysis_variance av
    LEFT JOIN elections e 
    ON av.date = e.date 
    AND av.election_type = e.election_type
    AND av.rs = e.rs
    FULL JOIN election_party_family epf
    ON av.rs = epf.rs
    AND e.election_id = epf.election_id
    AND av.party_id=epf.party_id
    WHERE av.date = ?date 
    AND av.election_type = ?election_type
", date=election_date, election_type=election_type)

party_variances <- dbGetQuery(database, query)
##Remove all NAs and 0
party_variances_clean<-party_variances%>%filter(!is.na(cv),cv!=0,!is.na(party_family_id))
#party_variances_clean <- party_variances %>%
#  filter(!is.na(cv), cv != 0) %>%  # Keep NA in party_family_id
#  mutate(party_family_id = replace_na(party_family_id, 50))  # Replace NA with 50



party_variances_clean_dummy <- party_variances_clean %>%
  dummy_cols(select_columns = "party_family_id", 
             remove_first_dummy = FALSE, 
             remove_selected_columns = TRUE) %>%
  group_by(rs, party_id, standard_deviation, cv, election_id) %>%
  summarise(across(starts_with("party_family_id_"), max), .groups = "drop") %>%
  select(where(~ sum(.) >= 20))  # Keep only columns with at least 20 observations (effectivly a party must have had 10 municipalies)


##Regression with only the dummys
party_variances_clean_regression<-party_variances_clean_dummy%>%select(-rs,-party_id,-standard_deviation,-election_id)


model <- lm(cv ~ ., data = party_variances_clean_regression)
summary(model)
stargazer(model)


##Include also the size of the municipality
party_variances_clean_regression_city<-party_variances_clean_dummy%>%left_join(.,cities%>%select(rs,population))%>%select(-rs,-party_id,-standard_deviation,-election_id)
party_variances_clean_regression_city<-party_variances_clean_regression_city%>%mutate(population=log(population))
model <- lm(cv ~ ., data = party_variances_clean_regression_city)
summary(model)
stargazer(model)

party_variances_clean_plot_city<-party_variances_clean_dummy%>%
  left_join(.,cities%>%select(rs,population))%>%mutate(population=log(population))%>%
  pivot_longer(cols = starts_with("party_family_id_"), 
               names_to = "party_family_id", 
               values_to = "dummy") %>%
  filter(dummy == 1) %>%
  mutate(party_family_id = as.numeric(gsub("party_family_id_", "", party_family_id))) %>%
  select(-dummy) %>%
  left_join(election_party_family%>%select(party_family_id,name_short,color))

ggplot(party_variances_clean_plot_city, aes(y = cv, x = population, color = name_short)) +
  geom_jitter() +
  scale_color_manual(values = setNames(party_variances_clean_plot_city$color, party_variances_clean_plot_city$name_short)) +
  theme_minimal() +
  labs(x = "Log Population", y = "Coefficient of Variation (CV)", color = "Party")+
  theme(legend.position = "bottom", legend.title = element_text(size = 12))
export("06_cv_logpop")


#Interaction
model_interaction_cv_parties <- lm(cv ~ population + 
                                     party_family_id_1*population + 
                                     party_family_id_3*population + 
                                     party_family_id_4*population + 
                                     party_family_id_5*population + 
                                     party_family_id_6*population + 
                                     party_family_id_7*population + 
                                     party_family_id_50*population, 
                                   data = party_variances_clean_regression_city)
summary(model_interaction_cv_parties)
stargazer(model_interaction_cv_parties)



##Only do size
party_variances_clean_regression_population<-party_variances%>%left_join(.,cities%>%select(rs,population))%>%select(cv,population)
party_variances_clean_regression_population<-party_variances_clean_regression_population%>%mutate(population=log(population))
model <- lm(cv ~ ., data = party_variances_clean_regression_population)
summary(model)




