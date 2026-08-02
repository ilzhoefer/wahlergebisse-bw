##Functions for analyzing the data
library(tidyverse)
library(httr)
library(pool)
library(RPostgres)
library(bit64)
DB_PASS<-Sys.getenv("DB_PASS")


database <- dbPool(
  drv = dbDriver("Postgres"),
  dbname = "election",
  #host = "db",
  host = "localhost",
  user = "election",
  password = DB_PASS,
  idleTimeout = 3600000
)


# Requires OPENAI_API_KEY to already be set in the environment before running this script.


#get all cities
query <- paste0("SELECT * from cities")
cities <- dbGetQuery(database, query)
setDT(cities)

source("./shiny/analysis_functions.R")

#Do the Variance calculation
#Gemeinde
analysis_variance_election(cities,6,as.Date("2024-06-09"))

#Do the Name Analysis (this is very inefficient as it takes a long time for the API to respond. Therefore analysis_name_run_jobs.r was created to paralelize this process)
#Gemeinde
analysis_name(cities,6,as.Date("2024-06-09"),1)
 