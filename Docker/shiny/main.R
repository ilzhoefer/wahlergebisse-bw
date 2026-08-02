##These are the scripts, that were used by Maximilian Ilzhöfer to gather his data and analyze the data for his Master's thesis
##Do names matter in local elections?
##This file contains the structure of the .R files in this directory
##The work is devided into 3 sections.
##  1. Data gathering
##  2. Data analysis
##  3. Data visualization with Shiny dashboard

##  1. Data gathering
#All new data Script files are named new_data*.R
#new_data_calls.R contains the function calls in order that they must be called to gain all required data
#new_data_functions.R contains all the functions itself

##  2. Data analysis
#All script files used for this are named analysis*.R
#analysis_functions.R contains the functions used for OpenAI API-Calls
#analysis.R contains code for the inefficient gathering of name characteristics. This should not be used as the API is slow
#analysis_name_run_jobs.R solves this problem by using RStudios Background Jobs to run multiple cities in paralell. This enables a much faster data gathering
#analysis_name_process_chunk.R this will be calles by analysis_name_run_jobs.R
#analysis_discriptive.R is used for all figures and tables in Chapter 4.1 of the thesis
#analysis_regression.R is used for OLS regression for voter strategy analyis in Chapter 4.2
#analysis_names.R is used for all regressions, tables and figures in 4.3
#analysis_old.R is no longer used. It was intended to be used with LLaMA

##  3. Data visualization with Shiny dashboard
#app.R contains the code to run the Shiny app
#shiny_functions.R contain functions for the Shiny app
#shiny_helpers.R contain additional functions 