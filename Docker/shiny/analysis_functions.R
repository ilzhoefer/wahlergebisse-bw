##Functions for analyzing the data
#it will be sourced automatically

library(ellmer)

##Wrapper for OpenAI Call
openai_call<-function(name, model = "gpt-4o-mini") {
  chat <- chat_openai(
    model = "gpt-4o-mini",
    system_prompt = "You are a demographic and cultural analysis expert. When given a name, provide:
An estimated age of a person with this name (only as a number).
A likelihood score from 1 (very likely male) to 10 (very unlikely male) indicating the gender association of the name.
A likelihood score from 1 (very likely of German origin) to 10 (very unlikely of German origin) indicating the cultural origin of the name.
Respond only in JSON format with the keys: age, gender, and german.",
  )
  
  # Using tryCatch to handle any errors
  response <- tryCatch({
    # Call the chat API with the provided name
    chat$chat(name)
  }, error = function(e) {

    return("Error")
  })
  
  # Clean the response to ensure it's valid JSON
  cleaned_response <- gsub("```json|```", "", response)
  cleaned_response <- trimws(cleaned_response)
  
  # Parse the cleaned JSON response into an R list
  result <- tryCatch({
    fromJSON(cleaned_response)
  }, error = function(e) {
    
    return("Error")
  })
  return(result)
}

##Call GPT for Name Analysis
analysis_name<-function(cities,election_type,election_date,max_runs, model = "gpt-4o-mini"){
  
  for (i in 1:nrow(cities)) {
    cur_city<-cities[i]
    print(paste("Processing city", cur_city$name, "| Number:", i, "of", nrow(cities)))
    ##Get the election
    query<-sqlInterpolate(conn=database,"SELECT * FROM public.elections where 
                          election_type = ?election_type AND 
                          rs = ?rs AND 
                          date = ?election_date "
                          ,election_type=election_type,rs=cur_city$rs,election_date=election_date)
    cur_election<-dbGetQuery(database,query)
    
    if(nrow(cur_election)==0){
      print(paste("Skipping city", cur_city$name, "| Number:", i, "of", nrow(cities)))
      next
    }
    
    ##Get the election results
    query<-sqlInterpolate(conn=database,"SELECT * FROM public.election_result where
                          election_id = ?election_id AND
                          rs = ?rs"
                          ,election_id=cur_election$election_id,rs=cur_city$rs)
    cur_result<-dbGetQuery(database,query)
    if(nrow(cur_result)==0){
      print(paste("Skipping city", cur_city$name, "| Number:", i, "of", nrow(cities)))
      next
    }
    setDT(cur_result)
    unique_candidates<-cur_result%>%select(rs,party_id,candidate_name)%>%unique()
    pb<-txtProgressBar(0,nrow(unique_candidates),0,style=3)
    for (j in 1:nrow(unique_candidates)) {
      cur_candidate<-unique_candidates[j]
      
      ##check if we already have entries in the database
      query<-sqlInterpolate(conn=database,"SELECT * FROM public.analysis_name where 
                            election_type = ?election_type AND 
                            date = ?election_date AND 
                            rs = ?rs AND 
                            ai_model = ?ai_model AND 
                            candidate_name = ?candidate_name AND 
                            party_id = ?party_id "
                            ,election_type=election_type,rs=cur_city$rs,election_date=election_date,ai_model=model,candidate_name=cur_candidate$candidate_name,party_id=cur_candidate$party_id)
      cur_analysis_db<-dbGetQuery(database,query)
      ##If the number of Max runs is not larger than the number of rows, skip the person. 
      if(nrow(cur_analysis_db)>=max_runs){
        setTxtProgressBar(pb,j)
        next
      }
      
      #Call the wrapper in a repeat, so if the response is an error it can be tried again
      k<-1
      repeat{
        ##Now call the GPT wrapper
        gpt_response<-openai_call(cur_candidate$candidate_name,model)
        
        #First check if a List has been returned and then if all information is there
        if(is.list(gpt_response)){
          if(is.numeric(gpt_response$age)&
             is.numeric(gpt_response$gender)&
             is.numeric(gpt_response$german)){
            break
          }
        }
        
        #if it has been tried for more than 5 times leave as well
        if(k>5){
          break
        }
        print("Error while API call, will be tried again")
        k<-k+1
        }
      new_data<-cur_candidate%>%mutate(election_type=election_type,date=election_date,ai_model=model,run=nrow(cur_analysis_db)+1,candidate_age=gpt_response$age,candidate_gender=gpt_response$gender,candidate_origin=gpt_response$german)
      insert_to_db(database, "analysis_name", new_data)
      
      
      setTxtProgressBar(pb,j)
    }
    close(pb)
    
    
    
  }
}





##Calculate the Variance for Votes in one Party list

analysis_variance_election<-function(cities,election_type,election_date){
  
  for (i in 1:nrow(cities)) {
    cur_city<-cities[i]
    print(paste("Processing city", cur_city$name, "| Number:", i, "of", nrow(cities)))
    ##Get the election
    query<-sqlInterpolate(conn=database,"SELECT * FROM public.elections where 
                          election_type = ?election_type AND 
                          rs = ?rs AND 
                          date = ?election_date "
                          ,election_type=election_type,rs=cur_city$rs,election_date=election_date)
    cur_election<-dbGetQuery(database,query)
    
    if(nrow(cur_election)==0){
      print(paste("Skipping city", cur_city$name, "| Number:", i, "of", nrow(cities)))
      next
    }
    
    ##Get the election results
    query<-sqlInterpolate(conn=database,"SELECT * FROM public.election_result where
                          election_id = ?election_id AND
                          rs = ?rs"
                          ,election_id=cur_election$election_id,rs=cur_city$rs)
    cur_result<-dbGetQuery(database,query)
    if(nrow(cur_result)==0){
      print(paste("Skipping city", cur_city$name, "| Number:", i, "of", nrow(cities)))
      next
    }
    setDT(cur_result)
    
    unique_partys<-unique(cur_result$party_id)
    for (j in unique_partys) {
      cur_party_result<-cur_result%>%filter(party_id==j)
      cur_sum<-cur_party_result%>%group_by(candidate_name)%>%
        summarise(total_votes = sum(vote_count, na.rm = TRUE)) 
      #Calculate SD and CV
      sd <- sd(cur_sum$total_votes)
      cv <- sd / mean(cur_sum$total_votes)
      new_data<-cur_party_result%>%select(rs,party_id)%>%unique()%>%mutate(election_type=election_type,date=election_date,standard_deviation=sd,cv=cv,ps_id=0)
      insert_to_db(database, "analysis_variance", new_data)
      
      
    }
    
    
  }
  
  
}

