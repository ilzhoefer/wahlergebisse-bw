##This script can be used to import new election data. 

library(tidyverse)
library(httr)
library(pool)
library(RPostgres)
library(bit64)
library(data.table)
library(sf)

DB_PASS<-Sys.getenv("DB_PASS")

# Getting the path of your current open file
current_path = rstudioapi::getActiveDocumentContext()$path 
setwd(dirname(current_path ))

database <- dbPool(
  drv = dbDriver("Postgres"),
  dbname = "election",
  #host = "db",
  host = "localhost",
  user = "election",
  password = DB_PASS,
  idleTimeout = 3600000
)
#get all functions from new_data_functions.R
source("./new_data_functions.R")

#get all cities
query <- paste0("SELECT * from cities")
cities <- dbGetQuery(database, query)
setDT(cities)


##Get all elections that are currently maintained. 
update_election_dates(cities)

 ##Update and sets the election type for all elections
set_election_type(database)

##Get all Polling Stations
get_polling_stations_election(cities,date=as.Date("2025-02-23"),election_type=2,skip_processed = TRUE)

#Get results for one election
get_results_city(cities,as.Date("2025-02-23"),2,skip_processed = TRUE)

#Update the party families for a select election
update_party_family(as.Date("2025-02-23"),2,TRUE)

#Update the aggregate information, where the map will be getting its information
update_aggregate_party(as.Date("2025-02-23"),2,TRUE)
geo_stuttgart_2025 <- st_read("./data/Stuttgart_Bezirke_2025.geojson") %>% mutate(date=as.Date('2025-02-23'))
update_mapping_stuttgart(database,geo_stuttgart_2025,as.Date("2025-02-23"),2) #this one is for Stuttgart as for the special map mode


#Get elected members for Gemeinderat
get_results_city(cities,as.Date("2024-06-09"),6,TRUE)

get_elected_members(cities,as.Date("2024-06-09"),6)


