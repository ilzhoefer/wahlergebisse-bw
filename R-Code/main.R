#Clear all Variables
rm(list = ls(all.names=TRUE))
options(scipen = 999)

# Getting the path of your current open file
current_path = rstudioapi::getActiveDocumentContext()$path 
setwd(dirname(current_path ))

#Set api key for Zensus Requests
zensus_key<-"34bb699bb071456d85db94b7e4ba7fdf"

library(tidyverse)
library(data.table)
library(magrittr)
library(dplyr)
library(stringr)
library(httr)

source("functions.R")

#Define some Tables
elections<-
  data.table(election_id=numeric(),election_type=numeric(),election_name=character(),rs=numeric(),date=Date(),votetype_id=numeric(),votetype_description=character())
election_type<-
  data.table(election_type=as.numeric(1),election_description=as.character("Gemeinderatswahl"))
polling_stations<-
  data.table(rs=as.numeric(NULL),ps_id=as.numeric(NULL),name=as.character(NULL),adress=as.character(NULL),description=character(),date=Date(),is_postal=logical(),election_id=numeric())
party<-
  data.table(party_family_id=as.numeric(NULL),name_short=as.character(NULL),name_long=as.character(NULL))
election_party<-
  data.table(rs=as.numeric(NULL),election_id=as.numeric(NULL),party_id=as.numeric(NULL),name=as.character(NULL),party_family_id=as.numeric(),color=as.character(NULL),name_long=as.character(NULL))
election_result<-
  data.table(rs=as.numeric(NULL),election_id=as.numeric(NULL),ps_id=as.numeric(NULL),party_id=as.numeric(NULL),
             vote_count=as.numeric(NULL),vote_percent=as.numeric(NULL),vote2_count=as.numeric(NULL),vote2_percent=as.numeric(NULL),
             candidate_name=as.character(NULL),candidate_occupdation=as.character(NULL),candidate_age=as.numeric(NULL))
election_result_ps<-
  data.table(rs=as.numeric(NULL),election_id=as.numeric(NULL),ps_id=as.numeric(NULL),votes_eligible=numeric(),voters=numeric(),invalid_ballots=numeric(),valid_ballots=numeric(),votes_cast=numeric(),turnout=numeric() )

#read files from Database
polling_stations<-data.table(read_csv(file = "./Database/polling_stations.csv"))
election_party<-data.table(read_csv(file = "./Database/election_party.csv"))
election_result<-data.table(read_csv(file = "./Database/election_result.csv"))
election_result_ps<-data.table(read_csv(file = "./Database/election_result_ps.csv"))
election_type<-data.table(read_csv(file = "./Database/election_type.csv"))
elections<-data.table(read_csv(file = "./Database/elections.csv"))
cities<-data.table(read_csv(file = "./Database/cities.csv"))
party<-data.table(read_csv(file = "./Database/party.csv"))


#Read File with information about Cities
cities_orig<-read.csv("./Input/1000A-0000_de.csv",skip = 4,sep = ";",col.names = c("rs","name","unit","quantitative_unit","population"))

#Convert the 12-Digit Regionalschlüssel to the 8-Digit Amtlicher Gemeindeschlüssel
cities_orig %<>%
  mutate(ags = as.numeric(str_c(str_sub(rs, 1, 5), str_sub(rs, 10, 12))))  %>%
  select(1, ags, everything())
cities_orig$rs%<>%as.numeric()
#Delete all Cities outside of BW and delete collums that are not needed
cities<-cities_orig %>% filter(between(rs,080000000000,089999999999)) %>% select(-ends_with("unit"))
setDT(cities)


#Get all Dates and Election IDs for Baden Würtemberg
for (i in 1:nrow(cities)) {
  cur_city<-cities[i]
  print(paste("Processing city", cur_city$name, "| Number:", i, "of", nrow(cities)))
  #Get all Dates
  election.dates<-get_election_dates(cur_city$ags)
  for (j in seq_along(election.dates)) {
    cur_date<-election.dates[[j]]
    #Get infos for Date
    cur_election_ids<-get_election_ids(cur_city$ags,cur_date)
    #if anything else than a data.table gets returned than the API is not set up
    if(is.data.table(cur_election_ids)==FALSE){
      next
    }
    if(nrow(cur_election_ids)==0){
      next
    }
    colnames(cur_election_ids)<-c("election_id","election_name","votetype_id","votetype_description")
    elections<-cur_election_ids%>%cbind(.,date=cur_date,rs=cur_city$rs)%>%rbind(.,elections,fill=TRUE)
    
  }
}
  
##Get the correct Election Type for every election
for (i in 1:nrow(election_type)) {
  cur_election_type<-election_type[i]
  orig_pattern <- pattern <- cur_election_type$election_description
  type <- cur_election_type$election_type
  
  # Find all Names and set Type
  elections %<>%
    mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
  #Sometimes only the Name of the camber is used
  pattern %<>% gsub("swahl","",.) %>% gsub("wahl","",.)
  # Find all Names and set Type
  elections %<>%
    mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
  #Sometimes only the Name of the camber is used
  pattern %<>% gsub("srat","",.)
  elections %<>%
    mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
  #Add some special replacements (but only after the last run)
  if(i==nrow(election_type)){
    pattern<-"RV Stuttgart"
    type<-election_type[election_description=="Regionalwahl",election_type]
    elections %<>%
      mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
    pattern<-"GR "
    type<-election_type[election_description=="Gemeinderatswahl",election_type]
    elections %<>%
      mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
    pattern<-"Stadtratswahl"
    type<-election_type[election_description=="Gemeinderatswahl",election_type]
    elections %<>%
      mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
    pattern<-"Kommunalwahl"
    type<-election_type[election_description=="Gemeinderatswahl",election_type]
    elections %<>%
      mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
    pattern<-"OB"
    type<-election_type[election_description=="Bürgermeisterwahl",election_type]
    elections %<>%
      mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
    pattern<-"BM"
    type<-election_type[election_description=="Bürgermeisterwahl",election_type]
    elections %<>%
      mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
    pattern<-"Neuwahl"
    type<-election_type[election_description=="Bürgermeisterwahl",election_type]
    elections %<>%
      mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
    pattern<-"Stichwahl"
    type<-election_type[election_description=="Bürgermeisterwahl",election_type]
    elections %<>%
      mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
    pattern<-"Kreisräte"
    type<-election_type[election_description=="Kreistagswahl",election_type]
    elections %<>%
      mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
    pattern<-"OR"
    type<-election_type[election_description=="Ortschaftsratswahl",election_type]
    elections %<>%
      mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
    pattern<-"Gemeind"
    type<-election_type[election_description=="Gemeinderatswahl",election_type]
    elections %<>%
      mutate(election_type = ifelse(grepl(pattern, election_name, ignore.case = TRUE) & is.na(election_type), type, election_type))
    ##Ganz am ende den Rest auf 10 setzten
    type<-election_type[election_description=="Andere",election_type]
    elections %<>%
      mutate(election_type = ifelse(is.na(election_type), type, election_type))
  }
}


#Get all Poling Stations in Baden-Würtemberg
cur_election_type<-6
for (i in 1:nrow(cities)) {
  cur_city<-cities[i]
  print(paste("Processing city", cur_city$name, "| Number:", i, "of", nrow(cities)))
  election_date<-as.Date("09.06.2024","%d.%m.%Y")
  #build API links to get Polling stations
  #for this one we will need one Election ID from that date. Find one with Data
  cur_elections<-elections[rs==cur_city$rs&date==election_date&election_type==cur_election_type]
  if(nrow(cur_elections)==0){
    message(paste0("Relevant election for City ",cur_city$name," not maintained. Skip"))
    next
  }
  
  #cur_elections<-elections[rs==cur_city$rs&date==election_date]
  #Currently this for loop does nothing
  for (j in 1:nrow(cur_elections)) {
    election_id<-elections[rs==cur_city$rs&date==election_date&election_type==cur_election_type,election_id][j]
    ps_post_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/daten/api/wahl_%d/uebersicht_ebene_6_0.json",format(election_date,"%Y%m%d"),cur_city$ags,election_id)
    ps_post_get<-GET(ps_post_url)
    if(ps_post_get$status_code==200){
      ps_post_content<-content(ps_post_get)
      wahlbezirke<-ps_post_content$tabelle$zeilen
      if(is.null(wahlbezirke)){
        next
      }else{
        break
      }
    }
  }
  if(!is.null(wahlbezirke)){
    #Ps_get_content<-content(ps_get)
    ps_post_content<-content(ps_post_get)
    #wahlraeume <- Ps_get_content$wahlraeume
    wahlbezirke<- ps_post_content$tabelle$zeilen
    for (j in seq_along(wahlbezirke)) {
      wahlbezirk<-wahlbezirke[[j]]
      titel<-wahlbezirk$label
      id<-str_extract(wahlbezirk$link$id, "[^_]+$")%>%as.numeric()
      print(paste("Processing polling station:", id, "| Number:", j, "of", length(ps_post_content$tabelle$zeilen),"| City:", i, "of", nrow(cities)))
      #get additional metadata
      ps_meta_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/daten/api/wahlraum_%s.json",format(election_date,"%Y%m%d"),cur_city$ags,id)
      ps_meta_get<-GET(ps_meta_url)
      #If we get a result, it is a real Polling station, if not it is a Postal polling region
      if(ps_meta_get$status_code==200){
        ps_postal<-FALSE
        Ps_meta_get_content<-content(ps_meta_get)
        adress<-paste(Ps_meta_get_content$strasse_hnr,Ps_meta_get_content$plz_ort)
        ps_barrierefrei<-Ps_meta_get_content$barrierefrei
      }else{
        ps_postal<-TRUE
        adress<-NA
        ps_barrierefrei<-NA
      }
      
      
      
      
      # Append to the data.frame
      polling_stations <- rbind(polling_stations,
                                data.table(rs=cur_city$rs,ps_id=id,name=titel,adress=adress,description=ps_barrierefrei,date=election_date,is_postal=ps_postal,election_id=election_id),fill=TRUE)
    }
    
  }else{
    cat(paste0("Error getting Polling stations ",cur_city$name))
  }
  
  
}
#In the End ensure, that all Poling Stations that contain the phrase "Briefwahl" have no Adress and are Maintained as postal stations

polling_stations %<>%
  mutate(
    description = if_else(str_detect(name, "(?i)Briefwahl"), NA, description),
    is_postal = if_else(str_detect(name, "(?i)Briefwahl"), TRUE, is_postal),
    adress = if_else(str_detect(name, "(?i)Briefwahl"), NA, adress)
  )

##Get the election results for one specific Election
tic()
for (i in 1001:nrow(cities)) {
  cur_city<-cities[i]
  print(paste("Processing city", cur_city$name, "| Number:", i, "of", nrow(cities)))
  cur_election_date<-as.Date("09.06.2024","%d.%m.%Y")
  cur_election_type<-6
  #Get all relevant polling stations
  relevant_ps<-polling_stations%>%filter(rs==cur_city$rs&date==cur_election_date)
  #Get relevant election
  relevant_election<-elections%>%filter(rs==cur_city$rs&date==cur_election_date&election_type==cur_election_type)
  #it is possbile that the election is not online therefore skip the city
  if(nrow(relevant_election)==0|nrow(relevant_ps)==0){
    message(paste0("Relevant election for City ",cur_city$name," not maintained. Skip"))
    next
  }
  
  #Cycle through all polling stations
  for (j in 1:nrow(relevant_ps)) {
    cur_ps<-relevant_ps[j]
    print(paste("Processing polling station:", cur_ps$ps_id, "| Number:", j, "of", nrow(relevant_ps),"| City:", i, "of", nrow(cities)))
    result_ps<-get_results_single_ps(polling_station=cur_ps,election=relevant_election,ags=cur_city$ags,rep=j)
    if(typeof(result_ps)=="character"){
      #An error was returned. Print it and go to next Polling station
      print(result_ps)
      next
    }
    results_party<-result_ps$results_party
    results<-result_ps$results
    metadata<-result_ps$metadata
    election_result_ps<-metadata%>%cbind(.,rs=cur_city$rs,election_id=relevant_election$election_id,ps_id=cur_ps$ps_id)%>%rbind(election_result_ps,.)
    election_result<-results%>%cbind(.,rs=cur_city$rs,election_id=relevant_election$election_id,ps_id=cur_ps$ps_id)%>%rbind(election_result,.)
    if(j==1){
      election_party<-results_party%>%cbind(.,rs=cur_city$rs,election_id=relevant_election$election_id)%>%rbind(election_party,.,fill=TRUE)
    }
    
    
  }
  #Do intermediate saving after every 25 Cities
  if(mod(i,25)==0){
    print(paste0("Saving current progress"))
    write_csv(election_party, file = "./Database/election_party.csv")
    write_csv(election_result, file = "./Database/election_result.csv")
    write_csv(election_result_ps, file = "./Database/election_result_ps.csv")
  }
  
}
toc()


#write files to Database
write_csv(polling_stations, file = "./Database/polling_stations.csv")
write_csv(election_party, file = "./Database/election_party.csv")
write_csv(election_result, file = "./Database/election_result.csv")
write_csv(election_result_ps, file = "./Database/election_result_ps.csv")
write_csv(election_type, file = "./Database/election_type.csv")
write_csv(elections, file = "./Database/elections.csv")
write_csv(cities, file = "./Database/cities.csv")
write_csv(party, file = "./Database/party.csv")








