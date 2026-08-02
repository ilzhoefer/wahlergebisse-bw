#Clear all Variables
rm(list = ls(all.names=TRUE))
options(scipen = 999)

# Getting the path of your current open file
#current_path = rstudioapi::getActiveDocumentContext()$path 
#setwd(dirname(current_path ))


library(tidyverse)
library(data.table)
library(magrittr)
library(dplyr)
library(stringr)
library(httr)
library(tictoc)

source("functions.R")


election_party<-
  data.table(rs=as.numeric(NULL),election_id=as.numeric(NULL),party_id=as.numeric(NULL),name=as.character(NULL),party_family_id=as.numeric(),color=as.character(NULL),name_long=as.character(NULL))
election_result<-
  data.table(rs=as.numeric(NULL),election_id=as.numeric(NULL),ps_id=as.numeric(NULL),party_id=as.numeric(NULL),
             vote_count=as.numeric(NULL),vote_percent=as.numeric(NULL),vote2_count=as.numeric(NULL),vote2_percent=as.numeric(NULL),
             candidate_name=as.character(NULL),candidate_occupdation=as.character(NULL),candidate_age=as.numeric(NULL))
election_result_ps<-
  data.table(rs=as.numeric(NULL),election_id=as.numeric(NULL),ps_id=as.numeric(NULL),votes_eligible=numeric(),voters=numeric(),invalid_ballots=numeric(),valid_ballots=numeric(),votes_cast=numeric(),turnout=numeric() )

elections<-data.table(read_csv(file = "./Database/elections.csv"))
cities<-data.table(read_csv(file = "./Database/cities.csv"))
polling_stations<-data.table(read_csv(file = "./Database/polling_stations.csv"))
election_party<-data.table(read_csv(file = "./Database/election_party.csv",col_types = "nnncncc"))
election_result<-data.table(read_csv(file = "./Database/election_result.csv",col_types = "nnnnnnnnccn"))
election_result_ps<-data.table(read_csv(file = "./Database/election_result_ps.csv"))


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
write_csv(election_party, file = "./Database/election_party.csv")
write_csv(election_result, file = "./Database/election_result.csv")
write_csv(election_result_ps, file = "./Database/election_result_ps.csv")
toc()