##This will call the OpenAI API with R Backround jobs enabling us to send multiple requests at once. 

library(rstudioapi)
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
# Number of maximum concurrent jobs
max_jobs <- 64

# Function to run the script for a specific chunk
run_background_job <- function(chunk_id) {
  # Set the environment variable for the chunk ID
  Sys.setenv("CHUNK_ID" = chunk_id)
  
  # Run the job in the background using jobRunScript
  job <- jobRunScript(
    "./shiny/analysis_name_process_chunk.R",  # The script to run
    name = paste0("Chunk Job ", chunk_id),  # Job name
    importEnv = TRUE 
  )
  
  return(job)
}

# Split data into chunks (5 rows per chunk)
chunk_size <- 5
chunks <- split(cities, ceiling(seq_len(nrow(cities)) / chunk_size))

# Keep track of active jobs
job_list <- list()
running_jobs<-data.frame()

# Launch jobs dynamically
for (i in seq_along(chunks)) {
  # Wait until the number of running jobs is less than the max_jobs limit
  repeat{
    # Remove completed jobs from the list
    # List of jobs from .rs.api.listJobs()
    job_list_current <- .rs.api.listJobs()
    if(is.empty(job_list_current)){
      break
    }
    
    # Extract relevant information for each job, safely checking for missing fields
    job_info <- lapply(job_list_current, function(job) {
      # Use a safe extraction method to handle missing fields
      data.frame(
        job_id = ifelse(!is.null(job$id), job$id, NA),
        state_description = ifelse(!is.null(job$state_description), job$state_description, NA),
        name = ifelse(!is.null(job$name), job$name, NA),
        start_time = ifelse(!is.null(job$startTime), job$startTime, NA),
        stringsAsFactors = FALSE
      )
    })
    
    # Combine the list of data frames into one data frame
    job_df <- do.call(rbind.data.frame, job_info)
    running_jobs<-job_df%>%filter(state_description=="running")
    if((nrow(running_jobs) < max_jobs)){
      break
    }
    
    Sys.sleep(1)  # Wait briefly before checking again
  }
  
  # Run the job for this chunk
  job <- run_background_job(i)
  job_list[[length(job_list) + 1]] <- job  # Add the job to the list
  
  
  cat("Started job for chunk", i, "\n")
}

