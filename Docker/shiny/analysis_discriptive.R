library(scales)
library(tidyverse)
library(RPostgres)



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
setDT(relevant_results)

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

#Select all Unique Party Families
relevant_results_party_families<-relevant_results%>%select(rs,party_family_id,name)%>%unique()


#Boxberg is not included as it has 2 Persons named Volker Weber on one List
#Hayingen is not included as it has 2 Persons named Achim Geiselhart on one List
#Altheim (Landkreis Alb-Donau-Kreis) is not included, as it has no data on elected Persons



#How many municipalitys have election results?
relevant_results_unique_city%>%select(rs)%>%unique()%>%nrow()

#How many candidates have candidated?
relevant_results_unique_city%>%nrow()

#How many lists have candidated?
relevant_results_unique_city%>%select(-candidate_name,-vote_count)%>%unique()%>%nrow()

#How often has a certain Party family candidated?
relevant_results_party_families%>%left_join(election_party_family%>%select(party_family_id,name_short))%>%select(name_short)%>%table(useNA ="always")

#How many candidates have they?
relevant_results%>%select(rs,party_family_id,candidate_name)%>%unique()%>%left_join(election_party_family%>%select(party_family_id,name_short))%>%select(name_short)%>%table(useNA ="always")

#Give me a plot where we can see the impact of number of candidates and percentage of votes. 

ggplot(relevant_results_unique_city_meta, aes(x = reorder(candidates_city, vote_percentage, median), y = vote_percentage)) +
  geom_boxplot() +
  coord_flip() +
  theme_minimal() +
  labs(x = "Candidates in municipality", y = "Vote Percent") +
  scale_y_continuous(labels = label_number()) +  
  theme(axis.text.y = element_text(size = 6)) +  
  scale_x_discrete(breaks = function(x) x[seq(1, length(x), by = 10)])  # Show only every 10th label
export("01_votedistribution_bycandidates")

# Make the previous plot nicer by combining values
relevant_results_unique_city_meta_plot1 <- relevant_results_unique_city_meta %>%
  group_by(candidates_city) %>%
  summarize(median_vote = median(vote_percentage, na.rm = TRUE)) %>%
  mutate(city_group = ntile(median_vote, 100)) %>%
  right_join(relevant_results_unique_city_meta, by = "candidates_city")  # Bring back full data

# Create a label mapping
label_mapping <- relevant_results_unique_city_meta_plot1 %>%
  group_by(city_group) %>%
  summarise(candidate_city_label = first(candidates_city)) %>%
  ungroup()

labels_vector <- setNames(label_mapping$candidate_city_label, label_mapping$city_group)
all_levels <- sort(unique(as.character(relevant_results_unique_city_meta_plot1$city_group)))
selected_breaks <- all_levels[seq(1, length(all_levels), by = 10)]
selected_labels <- labels_vector[selected_breaks]

# Now create plot
ggplot(relevant_results_unique_city_meta_plot1, aes(x = factor(city_group), y = vote_percentage)) +
  geom_boxplot() +
  coord_flip() +
  theme_minimal() +
  labs(x = "Candidate per municipalities (Based on Percentiles)", 
       y = "Vote Percent") +
  scale_x_discrete(breaks = selected_breaks, labels = selected_labels)
export("02_votedistribution_bycandidates")

#Create Plots for Name Analysis
ggplot(analysis_name_clean, aes(x = median_gender)) +
  geom_histogram(binwidth = 1, fill = "darkblue", color = "white") +
  labs(x = "Median Gender (1 being Male; 10 being Female)", y = "Number of Names") +
  theme_minimal()
export("03_distribution_gender")

ggplot(analysis_name_clean, aes(x = median_origin)) +
  geom_histogram(binwidth = 1, fill = "darkblue", color = "white") +
  labs(x = "Median Ethnicity (1 being German)", y = "Number of Names") +
  theme_minimal()
export("04_distribution_origin")

ggplot(analysis_name_clean, aes(x = median_age)) +
  geom_density(fill = "darkblue", alpha = 0.4) +
  labs(x = "Age", y = "Density") +
  theme_minimal()
export("05_distribution_age")

analysis_name_clean%>%select(median_age)%>%table()

#Calculate percentage of Entries that end in 0 or 5
analysis_name_clean %>%   filter(str_ends(as.character(median_age), "5") | str_ends(as.character(median_age), "0")) %>% nrow() /analysis_name_clean%>%nrow()

#select only names that were also elected
analysis_name_elected<-analysis_name_clean %>% right_join(elected_names_raw,join_by(candidate_name,rs,date,party_id))

#Do the gender Analysis. For this first we need the Party family. 
analysis_name_elected_gender_analysis<-analysis_name_elected %>% right_join(relevant_results%>%select(party_family_id,party_id,rs)%>%unique())
analysis_name_elected_gender_analysis<-analysis_name_elected_gender_analysis%>%left_join(election_party_family)
#Delete entries from multiple party lists
analysis_name_elected_gender_analysis <- analysis_name_elected_gender_analysis %>%  add_count(rs, party_id, candidate_name) %>%   filter(n == 1) %>%  select(-n)
#And entries without Party
analysis_name_elected_gender_analysis <- analysis_name_elected_gender_analysis %>%  filter(!is.na(party_family_id))
#And entries where mean_age is 5 or 6
analysis_name_elected_gender_analysis <- analysis_name_elected_gender_analysis %>% filter(!between(median_gender,5,6))
#Now construct a variable, is_female
analysis_name_elected_gender_analysis <- analysis_name_elected_gender_analysis %>%  mutate(is_female = ifelse(median_gender > 6, 1, 0))

analysis_name_elected_gender_analysis %>%  group_by(name_short) %>% summarise(
    total_candidates = n(),
    female_candidates = sum(is_female, na.rm = TRUE),
    female_percentage = (female_candidates / total_candidates) * 100
  )
