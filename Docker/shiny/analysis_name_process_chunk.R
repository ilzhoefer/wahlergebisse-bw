# process_chunk.R
#This will be called from analysis_name_run_jobs.R

library(DT)
library(rjson)
library(pool)
library(dplyr)
library(tidyr)
library(RPostgres)
library(shinythemes)
library(data.table)
library(bit64)
library(stringr)
library(ellmer)


database <- dbPool(
  drv = dbDriver("Postgres"),
  dbname = "election",
  #host = "db",
  host = "localhost",
  user = "election",
  password = DB_PASS,
  idleTimeout = 3600000
)

##Functions for analyzing the data
# Requires OPENAI_API_KEY to already be set in the environment before running this script.


# Define the analysis function
process_chunk <- function(chunk, chunk_id) {
  #log_file <- paste0("chunk_", chunk_id, "_log.txt")

  chunk[chunk_id]
  # Call of analysis function. 
  analysis_name(chunk, election_type = 6, election_date = as.Date("2024-06-09"), max_runs = 5)
  }

# Get arguments from the environment
chunk_id <- as.integer(Sys.getenv("CHUNK_ID"))
#chunk_data <- readRDS("cities_chunk.RDS")

# Process the chunk
process_chunk(chunks[[chunk_id]], chunk_id)
