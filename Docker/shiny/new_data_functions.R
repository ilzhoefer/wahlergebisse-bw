##make a wrapper for dbAppendTable, that only throws a warning for duplication errors
insert_to_db<-function(con,name,value,...){
  tryCatch({
    dbAppendTable(con, name, value, ...)
  }, error = function(e) {
    warning(paste0("Error ",e," occured in '",name,"' table. Continuing..."))
  })
}

insert_to_db_new <- function(con, name, value, unique_cols, ...) {
  
  #Get existing records based on the unique columns
  unique_col_names <- paste(unique_cols, collapse = ", ")
  query <- paste0("SELECT ", unique_col_names, " FROM ", name)
  existing_records <- dbGetQuery(con, query)
  
  #Filter out the rows from 'value' that are already in the database
  if (nrow(existing_records) > 0) {
    new_records <- dplyr::anti_join(value, existing_records)
  } else {
    # If no records exist yet, all rows are new
    new_records <- value
  }
  
  #Insert only the new records
  if (nrow(new_records) > 0) {
    dbAppendTable(con, name, new_records, ...)
    message(paste0("Inserted ", nrow(new_records), " new rows into the '", name, "' table."))
  } else {
    message("No new rows to insert.")
  }
}




##Insert Cities from CSV
insert_cities<-function(database,csv){
  dbAppendTable(database, "cities", csv, overwrite = FALSE, append=TRUE)
}

##Insert Parties from CSV
insert_party_family<-function(database,csv){
  dbAppendTable(database, "party", csv, overwrite = FALSE, append=TRUE)
}


##Insert Electiontypes from CSV
insert_election_types<-function(database,csv){
  dbAppendTable(database, "election_type", csv, overwrite = FALSE, append=TRUE)
}

##Insert district Mapping from Excel file
insert_district_mapping<-function(){
  districts<-read_xls("./shiny/data/BTW20214Q2020.xls",sheet = "Bundestagswahlkreise_2021",skip = 2)
  #only keep rows where the RS starts with an 8
  districts<-districts%>%filter(str_starts(RS,"08"))
  districts<-districts%>%select(RS,Nummer)%>%rename(rs = RS, district_id = Nummer)%>%mutate(.,date=as.Date('2021-09-26'),election_type=as.numeric(2),ps_id=NULL)
  districts<-districts%>%mutate(rs=as.integer64(rs),district_id=as.integer(district_id))
  insert_to_db_new(database,"election_vote_district_mapping",districts,colnames(districts))
  
}

insert_district_mapping_csv<-function(){
  districts<-read.csv("./data/btw25_wkr_gemeinden_20241130_utf8.csv",skip = 7,sep = ";",colClasses = "character")
  #only keep rows where the RS starts with an 8
  districts<-districts%>%filter(RGS_Land=="08")%>%mutate(rs=paste0(RGS_Land,RGS_RegBez,RGS_Kreis,RGS_GemVerband,RGS_Gemeinde))
  districts<-districts%>%select(rs,Wahlkreis.Nr)%>%rename(district_id = Wahlkreis.Nr)%>%mutate(.,date=as.Date('2025-02-23'),election_type=as.numeric(2),ps_id=NULL)
  districts<-districts%>%mutate(rs=as.integer64(rs),district_id=as.integer(district_id))
  insert_to_db_new(database,"election_vote_district_mapping",districts,colnames(districts))
}

##Update all election IDs for a set of cities
update_election_dates<-function(cities,election_date=NULL){
  #Get all Dates and Election IDs
  for (i in 1:nrow(cities)) {
    cur_city<-cities[i]
    print(paste("Processing city", cur_city$name, "| Number:", i, "of", nrow(cities)))
    #Get all Dates
    election.dates<-get_election_dates(as.numeric(cur_city$ags))
    if (!is.null(election_date)){
      election.dates<-election.dates[election.dates == election_date]
    }
    for (j in seq_along(election.dates)) {
      cur_date<-election.dates[[j]]
      #Get infos for Date
      cur_election_ids<-get_election_ids(as.numeric(cur_city$ags),cur_date)
      #if anything else than a data.table gets returned than the API is not set up
      if(is.data.table(cur_election_ids)==FALSE){
        next
      }
      if(nrow(cur_election_ids)==0){
        next
      }
      colnames(cur_election_ids)<-c("election_id","election_name","votetype_id","votetype_description","result_id")
      elections<-cur_election_ids%>%cbind(.,date=cur_date,rs=cur_city$rs)
      sql_upload<-elections%>%select(election_id,election_name,rs,date)%>%unique()
      insert_to_db(database, "elections", sql_upload)
      sql_upload<-elections%>%select(election_id,rs,votetype_id,votetype_description)%>%unique()
      insert_to_db(database, "elections_votetypes", sql_upload)
      
      
    }
  }
}
##Update election Type
update_election_type<-function(database=database,type,pattern){
  query <- sqlInterpolate(database, 
                          "UPDATE elections
                         SET election_type = ?type
                         WHERE election_name LIKE '%' || ?pattern || '%' AND election_type is NULL", 
                          pattern = pattern, type = type)
  dbExecute(database,query)
}



##Set Election Type
set_election_type<-function(database=database){
  election_type<-dbGetQuery(database, "SELECT * from election_type")
  setDT(election_type)
  ##Get the correct Election Type for every election
  for (i in 1:nrow(election_type)) {
    cur_election_type<-election_type[i]
    orig_pattern <- pattern <- cur_election_type$election_description
    type <- cur_election_type$election_type
    update_election_type(database,type,pattern)
    
    #Sometimes only the Name of the camber is used
    pattern <- pattern %>% gsub("swahl","",.) %>% gsub("wahl","",.)
    update_election_type(database,type,pattern)
    #Sometimes only the Name of the camber is used
    pattern <- pattern %>% gsub("srat","",.)
    update_election_type(database,type,pattern)
  }
  #Add some special replacements (but only after the last run)
  pattern<-"RV Stuttgart"
  type<-election_type[election_description=="Regionalwahl",election_type]
  update_election_type(database,type,pattern)
  
  pattern<-"Stadtratswahl"
  type<-election_type[election_description=="Gemeinderatswahl",election_type]
  update_election_type(database,type,pattern)
  
  pattern<-"Kommunalwahl"
  type<-election_type[election_description=="Gemeinderatswahl",election_type]
  update_election_type(database,type,pattern)
  
  pattern<-"Oberbürgermeister"
  type<-election_type[election_description=="Bürgermeisterwahl",election_type]
  update_election_type(database,type,pattern)
  
  pattern<-"OB"
  type<-election_type[election_description=="Bürgermeisterwahl",election_type]
  update_election_type(database,type,pattern)
  
  pattern<-"BM"
  type<-election_type[election_description=="Bürgermeisterwahl",election_type]
  update_election_type(database,type,pattern)
  
  pattern<-"Kreisräte"
  type<-election_type[election_description=="Kreistagswahl",election_type]
  update_election_type(database,type,pattern)
  
  pattern<-"OR"
  type<-election_type[election_description=="Ortschaftsratswahl",election_type]
  update_election_type(database,type,pattern)
  
  pattern<-"Gemeind"
  type<-election_type[election_description=="Gemeinderatswahl",election_type]
  update_election_type(database,type,pattern)
  
  pattern<-"GR"
  type<-election_type[election_description=="Gemeinderatswahl",election_type]
  update_election_type(database,type,pattern)
  
  pattern<-"Orts"
  type<-election_type[election_description=="Ortschaftsratswahl",election_type]
  update_election_type(database,type,pattern)
  
  pattern<-"Neuwahl"
  type<-election_type[election_description=="Gemeinderatswahl",election_type]
  update_election_type(database,type,pattern)
  
  pattern<-"Stichwahl"
  type<-election_type[election_description=="Gemeinderatswahl",election_type]
  update_election_type(database,type,pattern)
  
  #Ganz am ende den Rest auf 10 setzten
  type<-election_type[election_description=="Andere",election_type]
  update_election_type(database,type,"%")
}




##Get all Election dates for a specific City
get_election_dates<-function(ags){
  dates_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/%08d/api/termine.json",ags)
  dates_get<-GET(dates_url)
  dates_content<-content(dates_get)
  dates_termine<-dates_content$termine
  dates<-as.data.frame(do.call(rbind, dates_termine))%>%select("date")%>%unlist()%>%as.Date(.,"%d.%m.%Y")
  return(dates)
}


##Get the Election IDs for all elections of a specific date and City
get_election_ids<-function(ags,date){
  elid_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/daten/api/termin.json",format(date,"%Y%m%d"),ags)
  elid_get<-GET(elid_url)
  if(elid_get$status_code==200){
    elid_content<-content(elid_get)
    elid_wahleintraege<-elid_content$wahleintraege
  }else{
    #There is another API that is used sometimes
    elid_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/api/praesentation/termin.json",format(date,"%Y%m%d"),ags)
    elid_get<-GET(elid_url)
    if(elid_get$status_code==200){
      elid_content<-content(elid_get)
      elid_wahleintraege<-elid_content$wahleintraege
    }
  } 
  #Still no response? than Return the HTTP Code
  if(elid_get$status_code==200){
    return<-data.table(id=numeric(),title=character(),votetype=numeric(),votetype_name=character(),result_id=character())
    for (i in seq_along(elid_wahleintraege)) {
      cur_wahleintrag<-elid_wahleintraege[[i]]
      return<-rbind(return,
                    data.table(id=as.numeric(cur_wahleintrag$wahl$id),title=as.character(cur_wahleintrag$wahl$titel),
                               votetype=as.numeric(cur_wahleintrag$stimmentyp$id),votetype_name=as.character(cur_wahleintrag$stimmentyp$titel),result_id=as.character(cur_wahleintrag$gebiet_link$id)))
      
    }
    
    
  }else{
    return<-elid_get$status_code
  }
  return(return)
}

#Get Election Results for one election and City

#Get Polling Stations for one Election in a set of cities
get_polling_stations_election<-function(cities,election_type,date,skip_processed = FALSE){
  election_date<-as.Date(date,"%d.%m.%Y")
  setDT(cities)
  cur_election_type<-election_type
  for (i in 1:nrow(cities)) {
    cur_city<-cities[i]
    print(paste("Processing city", cur_city$name, "| Number:", i, "of", nrow(cities)))
    
    #build API links to get Polling stations
    #for this one we will need one Election ID from that date. Find one with Data
    query <- sqlInterpolate(database, "SELECT * from elections where rs = ?rs AND date = ?date AND election_type = ?type",
                            rs = cur_city$rs, date=election_date, type=cur_election_type)
    cur_elections<-dbGetQuery(database,query)
    
    if(nrow(cur_elections)==0){
      message(paste0("Relevant election for City ",cur_city$name," not maintained. Skip"))
      next
    }
    get_polling_station_election_city(election_id = cur_elections$election_id,
                                      ags=cur_city$ags,rs=cur_city$rs,election_date = as.Date(election_date),
                                      cur_city_id = i,total_cities = nrow(cities),skip_processed)
    
    
  }
  ##Check if any Polling station that contains the name Brief is correctly marked as postal
  query<-"UPDATE public.polling_stations
	        SET is_postal=TRUE
	        WHERE name like '%Brief%' and is_postal = FALSE"
  dbExecute(database,query)
  
}

##Get a single polling station for a specific Elecion and City
get_polling_station_election_city<-function(election_id,ags,rs,election_date,cur_city_id=NULL,total_cities=NULL,skip_processed){
  
  ps_post_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/daten/api/wahl_%d/uebersicht_ebene_6_0.json",format(election_date,"%Y%m%d"),as.numeric(ags),election_id)
  ps_post_get<-GET(ps_post_url)
  ps_post_content<-content(ps_post_get)
  wahlbezirke<-ps_post_content$tabelle$zeilen
  if(is.null(wahlbezirke)){
    #try other API
    ps_post_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/api/praesentation/wahl_%d/uebersicht_ebene_6_0.json",format(election_date,"%Y%m%d"),as.numeric(ags),election_id)
    ps_post_get<-GET(ps_post_url)
    ps_post_content<-content(ps_post_get)
    wahlbezirke<-ps_post_content$tabelle$zeilen
  }
  
  
  
  if(!is.null(wahlbezirke)){
    ##Check if all Pollingstations are already uploaded
    if(skip_processed){
      #Get all relevant polling stations
      query <- sqlInterpolate(database, "SELECT * from polling_stations where rs = ?rs AND date = ?date AND election_id = ?election_id",
                              rs = rs, date=election_date, election_id=election_id)
      relevant_ps<-dbGetQuery(database,query)
      if(nrow(relevant_ps)==length(wahlbezirke)){
        print(paste("Skip city all polling stations up to date"))
        return()
      }
    }
    
    
    for (j in seq_along(wahlbezirke)) {
      wahlbezirk<-wahlbezirke[[j]]
      titel<-wahlbezirk$label
      id<-str_extract(wahlbezirk$link$id, "[^_]+$")%>%as.numeric()
      print(paste("Processing polling station:", id, "| Number:", j, "of", length(ps_post_content$tabelle$zeilen),"| City:", cur_city_id, "of", total_cities))
      if(wahlbezirk[["statusString"]]!="eingegangen"){
        message(paste("Error in polling station:", id, "| Number:", j, "of", length(ps_post_content$tabelle$zeilen),"| City:", cur_city_id, "of", total_cities," Status: ",wahlbezirk[["statusString"]]))
        next
      }
      
      #get additional metadata
      ps_meta_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/daten/api/wahlraum_%s.json",format(election_date,"%Y%m%d"),as.numeric(ags),id)
      ps_meta_get<-GET(ps_meta_url)
      if(ps_meta_get$status_code!=200){
        #Try different API
        ps_meta_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/api/praesentation/wahlraum_%s.json",format(election_date,"%Y%m%d"),as.numeric(ags),id)
        ps_meta_get<-GET(ps_meta_url)
      }
      
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
      polling_stations <- data.table(rs=rs,ps_id=id,name=titel,adress=adress,description=ps_barrierefrei,date=election_date,is_postal=ps_postal,election_id=election_id)
      insert_to_db(database, "polling_stations", polling_stations)
    }
    
  }else{
    cat(paste0("Error getting Polling stations ",rs))
  }
  
}

#Get Election Results for one election and a set of Cities
get_results_city<-function(cities,election_date,election_type,skip_processed=FALSE){
  cur_election_date<-as.Date(election_date)
  cur_election_type<-election_type
  setDT(cities)
  for (i in 1:nrow(cities)) {
    cur_city<-cities[i]
    print(paste("Processing city", cur_city$name, "| Number:", i, "of", nrow(cities)))
    #Get relevant election
    query <- sqlInterpolate(database, "SELECT * from elections where rs = ?rs AND date = ?date AND election_type = ?type",
                            rs = cur_city$rs, date=election_date, type=cur_election_type)
    relevant_election<-dbGetQuery(database,query)
    setDT(relevant_election)
    
    #it is possbile that the election is not online therefore skip the city
    if(nrow(relevant_election)==0){
      message(paste0("Relevant election for City ",cur_city$name," not maintained. Skip"))
      next
    }
    
    #Get relevant votetypes
    query <- sqlInterpolate(database, "SELECT * from elections_votetypes where rs = ?rs AND election_id = ?election_id",
                            rs = cur_city$rs, election_id=relevant_election$election_id)
    relevant_votetypes<-dbGetQuery(database,query)
    setDT(relevant_votetypes)
    
    #Get all relevant polling stations
    query <- sqlInterpolate(database, "SELECT * from polling_stations where rs = ?rs AND date = ?date AND election_id = ?election_id",
                            rs = cur_city$rs, date=election_date, election_id=relevant_election$election_id)
    relevant_ps<-dbGetQuery(database,query)
    setDT(relevant_ps)
    
    #If we should skip processed entries, than check here if we already have an entry for every Polling Station in the Database
    #than we can skip the entire City
    if(skip_processed==TRUE){
      query <- sqlInterpolate(database, "SELECT * from election_result_ps where rs = ?rs AND election_id = ?election_id",
                              rs = cur_city$rs, election_id=relevant_election$election_id)
      check_skip<-dbGetQuery(database,query)
      if(nrow(check_skip)==(nrow(relevant_ps)*nrow(relevant_votetypes))){
        print(paste("Skip city", cur_city$name, "| Number:", i, "of", nrow(cities)))
        next
      }
      
    }
    
    #Cycle through all polling stations
    for (j in 1:nrow(relevant_ps)) {
      cur_ps<-relevant_ps[j]
      print(paste("Processing polling station:", cur_ps$ps_id, "| Number:", j, "of", nrow(relevant_ps),"| City:", i, "of", nrow(cities)))
      #Cycle through all votetypes
      for (k in 1:nrow(relevant_votetypes)) {
        cur_votetype<-relevant_votetypes[k]
        #If we should skip processed entries, than check here if we already have an entry for the Polling Station in the Database
        if(skip_processed==TRUE){
          query <- sqlInterpolate(database, "SELECT * from election_result_ps where rs = ?rs AND election_id = ?election_id AND ps_id = ?ps_id AND votetype_id = ?votetype_id",
                                  rs = cur_city$rs, election_id=relevant_election$election_id, ps_id = cur_ps$ps_id, votetype_id=cur_votetype$votetype_id)
          check_skip<-dbGetQuery(database,query)
          if(nrow(check_skip)>0){
            print(paste("Skip polling station:", cur_ps$ps_id, "| Number:", j, "of", nrow(relevant_ps),"| City:", i, "of", nrow(cities)))
            next
          }
          
        }
        ##For cities that have multiple Election Distiricts, we need the election parties for every Polling station.
        ##For Bundestagselections currently only in Stuttgart
        if(election_type==2 && cur_city$rs == 81110000000){
          include_party<-TRUE
          include_ps<-TRUE
        }else if(j==1){
          include_party<-TRUE
          include_ps<-FALSE
        }else{
          include_party<-FALSE
          include_ps<-FALSE
        }
        
        
        result_ps<-get_results_single_ps(polling_station=cur_ps,election=relevant_election,ags=cur_city$ags,include_party=include_party,votetype_id = cur_votetype$votetype_id,rs=cur_city$rs )
        if(typeof(result_ps)=="character"){
          #An error was returned. Print it and go to next Polling station
          message(result_ps)
          next
        }
        results_party<-result_ps$results_party
        results<-result_ps$results
        metadata<-result_ps$metadata
        
        election_result<-results%>%cbind(.,rs=cur_city$rs,election_id=relevant_election$election_id,ps_id=cur_ps$ps_id,votetype_id=cur_votetype$votetype_id)
        insert_to_db(database,"election_result",election_result)
        
        election_result_ps<-metadata%>%cbind(.,rs=cur_city$rs,election_id=relevant_election$election_id,ps_id=cur_ps$ps_id,votetype_id=cur_votetype$votetype_id)
        insert_to_db(database,"election_result_ps",election_result_ps)
        
        if(include_party&&include_ps){
          election_party<-results_party%>%cbind(.,rs=cur_city$rs,election_id=relevant_election$election_id,votetype_id=cur_votetype$votetype_id,ps_id=cur_ps$ps_id)
          insert_to_db(database,"election_party",election_party)
        }else if(include_party){
          election_party<-results_party%>%cbind(.,rs=cur_city$rs,election_id=relevant_election$election_id,votetype_id=cur_votetype$votetype_id)
          insert_to_db(database,"election_party",election_party)
        }
      }
    }
  }
}



#Get Election Results for one Polling station for one specific date and election
get_results_single_ps<-function(polling_station,election,ags,include_party=FALSE,votetype_id,rs){
  result_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/daten/api/wahl_%d/ergebnis_ebene_6_id_%d_%d.json"
                      ,format(election$date,"%Y%m%d"),as.numeric(ags),election$election_id,polling_station$ps_id,votetype_id)
  result_get<-GET(result_url)
  if(result_get$status_code==404){
    #Try different API
    result_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/api/praesentation/wahl_%d/ergebnis_ebene_6_id_%d_%d.json"
                        ,format(election$date,"%Y%m%d"),as.numeric(ags),election$election_id,polling_station$ps_id,votetype_id)
    result_get<-GET(result_url)
  }
  result_content<-content(result_get)
  results_rows<-result_content$Komponente$tabelle$zeilen
  ##It is possible that for some polling stations there is no result
  if(is.null(results_rows)){
    return(paste0("Results for polling station ",polling_station$ps_id," not avaliable. Skip"))
    break
  }
  #Get index for information
  # Helper function to get index
  get_index <- function(keywords) {
    idx <- which(sapply(result_content[["Komponente"]][["info"]][["tabelle"]][["zeilen"]],
                        function(x) x[["label"]][["labelKurz"]] %in% keywords))
    return(idx[1])  # return first match
  }
  
  index_eligible <- get_index(c("Wahlberechtigte"))
  index_voters <- get_index(c("Wähler/-innen","Wähler/innen"))
  index_invalid <- get_index(c("ungültige Stimmen", "ungültige Stimmzettel"))
  index_votes <- get_index(c("gültige Stimmen"))
  index_valid <- get_index(c("gültige Stimmzettel", "gültige Stimmen"))
  
  ##For some elections the valid_ballots are "---" as they corrospond with the votes_cast
  if(result_content$Komponente$info$tabelle$zeilen[[index_valid]]$zahl=="---"){
    #Than use the votes_cast as valid_ballots
    index_valid<-index_votes
  }
  
  
  
  
  #Get different Data depending on Postal or not
  #That information is probably better assumed by looking if the index_eligible returns something
  if(is.na(index_eligible)){
    
    metadata<-data.table(votes_eligible=NA,
                         voters=parse_number(result_content$Komponente$info$tabelle$zeilen[[index_voters]]$zahl,locale=locale(decimal_mark=",")),
                         invalid_ballots=parse_number(result_content$Komponente$info$tabelle$zeilen[[index_invalid]]$zahl,locale=locale(decimal_mark=",")),
                         valid_ballots=parse_number(result_content$Komponente$info$tabelle$zeilen[[index_valid]]$zahl,locale=locale(decimal_mark=",")),
                         votes_cast=parse_number(result_content$Komponente$info$tabelle$zeilen[[index_votes]]$zahl,locale=locale(decimal_mark=",")),
                         turnout=parse_number(result_content$Komponente$info$tabelle$zeilen[[index_voters]]$prozent,locale=locale(decimal_mark=",")))
    
  }else{
    
    metadata<-data.table(votes_eligible=parse_number(result_content$Komponente$info$tabelle$zeilen[[index_eligible]]$zahl,locale=locale(decimal_mark=",")),
                         voters=parse_number(result_content$Komponente$info$tabelle$zeilen[[index_voters]]$zahl,locale=locale(decimal_mark=",")),
                         invalid_ballots=parse_number(result_content$Komponente$info$tabelle$zeilen[[index_invalid]]$zahl,locale=locale(decimal_mark=",")),
                         valid_ballots=parse_number(result_content$Komponente$info$tabelle$zeilen[[index_valid]]$zahl,locale=locale(decimal_mark=",")),
                         votes_cast=parse_number(result_content$Komponente$info$tabelle$zeilen[[index_votes]]$zahl,locale=locale(decimal_mark=",")),
                         turnout=parse_number(result_content$Komponente$info$tabelle$zeilen[[index_voters]]$prozent,locale=locale(decimal_mark=",")))
    if(polling_station$is_postal){
      #In this case the polling station is not maintained correctly update the record
      query <- sqlInterpolate(database, 
                              "UPDATE polling_stations
                              SET is_postal = FALSE
                              WHERE ps_id = ?ps_id AND rs = ?rs AND election_id = ?election_id AND date = ?date", 
                              ps_id=polling_station$ps_id,rs=rs,election_id=election$election_id,date=election$date)
      dbExecute(database,query)
    }
  }
  #only include party data for the first call per city
  if(include_party==TRUE){
    #Sometimes a Imagefilename is provided not for all Parties. So just add it with NA
    result_content$Komponente$grafik$balken <- lapply(result_content$Komponente$grafik$balken, function(df) {
      if (!"imageFilename" %in% names(df)) {
        df$imageFilename <- NA  # Füge 'imageFilename' hinzu, wenn es fehlt
      }
      return(df)
    })
    result_content$Komponente$grafik$sonstigeBalken <- lapply(result_content$Komponente$grafik$sonstigeBalken, function(df) {
      if (!"imageFilename" %in% names(df)) {
        df$imageFilename <- NA  # Füge 'imageFilename' hinzu, wenn es fehlt
      }
      return(df)
    })
    party_data<-rbind(do.call(rbind.data.frame, result_content$Komponente$grafik$balken),do.call(rbind.data.frame, result_content$Komponente$grafik$sonstigeBalken))
    results_party<-data.table(party_id=numeric(),name=character(),color=character(),name_long=as.character(NULL))
  }
  results<-data.table(party_id=numeric(),vote_count=as.numeric(NULL),vote_percent=as.numeric(NULL),
                      #vote2_count=as.numeric(NULL),vote2_percent=as.numeric(NULL),
                      candidate_name=as.character(NULL),
                      candidate_occupation=as.character(NULL),candidate_age=as.numeric(NULL))
  
  for (i in seq_along(results_rows)) {
    cur_party<-results_rows[[i]]
    if(include_party==TRUE){
      #It can happen that the Paty is not formated correctly than just use the short name
      if(is.null(party_data$bezeichnungAusfuehrlich)){
        party_name_long<-NA
      }else{
        party_name_long<-party_data%>%filter(bezeichnung==cur_party$label$labelKurz)%>%select(bezeichnungAusfuehrlich)
      }
      results_party<-rbind(results_party,data.table(party_id=as.numeric(i),
                                                    name=as.character(cur_party$label$labelKurz),
                                                    color=as.character(cur_party$color),
                                                    name_long=as.character(party_name_long)))
    }else{
      results_party<-NULL
    }
    
    results_persons<-cur_party$sub_zeilen
    if(is.null(results_persons)){
      #In this case we have only one vote per votegroup
      results<-rbind(results,data.table(party_id=as.numeric(i),
                                        vote_count=parse_number(cur_party$zahl,locale=locale(decimal_mark=",")),
                                        vote_percent=parse_number(cur_party$prozent,locale=locale(decimal_mark=",")),
                                        candidate_name=as.character(cur_party$label$labelKurz)),fill=TRUE)
    }else{
      results<-rbindlist(lapply(seq_along(results_persons), function(j) {
        cur_person <- results_persons[[j]]
        data.table(party_id = as.numeric(i), vote_count = parse_number(cur_person$zahl, locale = locale(decimal_mark = ",")),
                   vote_percent = parse_number(cur_person$prozent, locale = locale(decimal_mark = ",")),
                   candidate_name = cur_person$label$labelKurz)
      }), fill = TRUE) %>% rbind(results,.,fill = TRUE)
      
    }
    
    
  }
  return(list(results=results,results_party=results_party,metadata=metadata))
}

##Update Party family for one election and Date
update_party_family<-function(date,election_type,override = FALSE){
  #Get all party familys
  party_families<-dbGetQuery(database,"SELECT * FROM party")
  setDT(party_families)
  if(override){
    query <- sqlInterpolate(database,"DELETE FROM election_party_family 
                          WHERE (rs, election_id) IN (
                          SELECT rs, election_id 
                          FROM elections 
                          WHERE election_type = ?election_type AND date = ?date);",
                            election_type=election_type,date=date )
    dbExecute(database,query) 
  }
  
  #Go through partys
  for (i in 1:nrow(party_families)) {
    cur_party<-party_families[i]
    query<-sqlInterpolate(database,"SELECT DISTINCT ep.* , e.election_type, e.date
                          FROM election_party ep
                          JOIN elections e ON e.election_id = ep.election_id AND e.rs = ep.rs
                          WHERE (ep.name_long LIKE '%' || ?name_long || '%' OR ep.name LIKE '%' || ?name_short || '%')
                          AND e.election_type = ?type AND e.date =?date",
                          name_long=cur_party$name_long,name_short=cur_party$name_short,type=election_type,date=date)
    selected_parties<-dbGetQuery(database,query)
    if(nrow(selected_parties)!=0){
      database_entry<-selected_parties%>%select(rs,election_id,party_id,ps_id,votetype_id)%>%cbind(data.table(party_family_id=cur_party$party_family_id),.)
      insert_to_db_new(database,"election_party_family",database_entry,c("election_id", "rs", "party_family_id","party_id","votetype_id"))
    }
    
    
  }
  
  
  
}

##Get elected members for Kreis and Gemeinde
get_elected_members<-function(cities,election_date,election_type){
  cur_election_date<-as.Date(election_date)
  cur_election_type<-election_type
  setDT(cities)
  for (i in 1:nrow(cities)) {
    cur_city<-cities[i]
    print(paste("Processing city", cur_city$name, "| Number:", i, "of", nrow(cities)))
    #Get relevant election
    query <- sqlInterpolate(database, "SELECT * from elections where rs = ?rs AND date = ?date AND election_type = ?type",
                            rs = cur_city$rs, date=cur_election_date, type=cur_election_type)
    relevant_election<-dbGetQuery(database,query)
    setDT(relevant_election)
    
    #it is possbile that the election is not online therefore skip the city
    if(nrow(relevant_election)==0){
      message(paste0("Relevant election for City ",cur_city$name," not maintained. Skip"))
      next
    }
    
    ##Get the Data from the API
    result_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/daten/api/wahl_%d/ergebnis_%s_0.json"
                        ,format(relevant_election$date,"%Y%m%d"),as.numeric(cur_city$ags),relevant_election$election_id,relevant_election$result_id)
    result_get<-GET(result_url)
    if(result_get$status_code==404){
      #Try different API
      result_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/api/praesentation/wahl_%d/ergebnis_%s_0.json"
                          ,format(relevant_election$date,"%Y%m%d"),as.numeric(cur_city$ags),relevant_election$election_id,relevant_election$result_id)
      result_get<-GET(result_url)
      if(result_get$status_code==404){
        stop()
      }
      
    }
    result_content<-content(result_get)
    #Get the relevant parties
    query <- sqlInterpolate(database, "SELECT * from election_party where rs = ?rs AND election_id = ?election_id",
                            rs = cur_city$rs, election_id=relevant_election$election_id)
    relevant_parties<-dbGetQuery(database,query)
    #Get the seats and create a data table
    seats<-result_content$Komponente$sitze$tabelle
    #if seats are empty go to next city
    if(is.null(seats)){
      message(paste("Skip city", cur_city$name, "| Number:", i, "of", nrow(cities)))
      next
    }
    
    seats_dt <- data.table::rbindlist(lapply(seats$zeilen, function(x) setNames(as.list(x), seats$ueberschriften)), fill = TRUE)
    #Combine them with the Party ID
    seats_dt <- seats_dt %>% left_join(.,relevant_parties%>%select(name,party_id),by=join_by("Wahlvorschlag"=="name")) 
    seats_clean <- seats_dt %>% select(Bewerber,Mandat,party_id)
    
    colnames(seats_clean)<-c("name","mandate_type","party_id")
    seats_sql<-seats_clean%>%cbind(.,relevant_election%>%select(-result_id,-election_name))
    seats_sql$mandate_type <- gsub("Gewählt", "Direktmandat", seats_sql$mandate_type)
    
    insert_to_db(database,"election_elected_candidates",seats_sql)
    
    
    
    }
}




##Update Aggregate Party and meta information for one election and date
#This script should aggretate the data per Party family as well as metainformation for 
#Regions: Gemeinde, Landkreis and Regierungsbezirk
update_aggregate_party<-function(date,election_type,override=FALSE){
  query<-sqlInterpolate(database,"SELECT DISTINCT er.* , e.election_type, p.name_short, p.party_family_id, p.color
                                  FROM election_result er
                                  JOIN elections e ON e.election_id = er.election_id AND e.rs = er.rs
                                  LEFT JOIN election_party_family epf on er.rs=epf.rs AND er.votetype_id=epf.votetype_id AND er.election_id=epf.election_id AND er.party_id=epf.party_id
						                      LEFT JOIN party p ON epf.party_family_id=p.party_family_id
                                  WHERE e.election_type = ?type AND e.date =?date",
                        type=election_type,date=date)
  selected_results_party<-dbGetQuery(database,query)
  query<-sqlInterpolate(database,"SELECT DISTINCT erp.* , e.election_type
                                  FROM election_result_ps erp
                                  JOIN elections e ON e.election_id = erp.election_id AND e.rs = erp.rs
                                  WHERE e.election_type = ?type AND e.date =?date",
                        type=election_type,date=date)
  selected_results_meta<-dbGetQuery(database,query)
  
  #Check if we should override data than delete
  if(override){
    
    #Create delete script and execute directly
    #For district
    query<-sqlInterpolate(database,"DELETE FROM election_result_aggregate_meta_district
                          WHERE election_type = ?type AND date =?date",
                          type=election_type,date=date)
    dbExecute(database,query)
    query<-sqlInterpolate(database,"DELETE FROM election_result_aggregate_party_district
                          WHERE election_type = ?type AND date =?date",
                          type=election_type,date=date)
    dbExecute(database,query)
    #And region
    query<-sqlInterpolate(database,"DELETE FROM election_result_aggregate_meta_region
                          WHERE election_type = ?type AND date =?date",
                          type=election_type,date=date)
    dbExecute(database,query)
    query<-sqlInterpolate(database,"DELETE FROM election_result_aggregate_party_region
                          WHERE election_type = ?type AND date =?date",
                          type=election_type,date=date)
    dbExecute(database,query)
    
  }
  
  
  
  #First do everything for the Gemeinden  
  city_sum_results_meta <- selected_results_meta %>%
    group_by(rs, votetype_id) %>%
    summarise(
      votes_eligible = sum(votes_eligible, na.rm = TRUE),
      voters = sum(voters, na.rm = TRUE),
      invalid_ballots = sum(invalid_ballots, na.rm = TRUE),
      valid_ballots = sum(valid_ballots, na.rm = TRUE),
      votes_cast = sum(votes_cast, na.rm = TRUE)
    )%>%
    mutate(turnout = voters / votes_eligible) %>%
    mutate(date=date)%>%
    mutate(election_type=election_type)
  
  
  city_sum_results_party<-selected_results_party %>% 
    group_by(rs, votetype_id, party_family_id,color) %>%
    summarise(vote_count = sum(vote_count, na.rm = TRUE)) %>%
    left_join(city_sum_results_meta %>% select(rs, votetype_id, votes_cast), by = c("rs", "votetype_id")) %>%
    mutate(vote_percent = vote_count / votes_cast) %>%
    select(-votes_cast) %>%
    mutate(date=date)%>%
    mutate(election_type=election_type)
  
  insert_to_db_new(database,"election_result_aggregate_party_region",city_sum_results_party,c("party_family_id","rs","election_type","date","votetype_id"))
  insert_to_db_new(database,"election_result_aggregate_meta_region",city_sum_results_meta,c("rs","election_type","date","votetype_id"))
  
  
  #And now for the Kreise
  kreis_sum_results_meta <- selected_results_meta %>%
    #This is cutting the Regionalschlüssel to the 4th position and filling the rest with zeros to get the Kreis of each place
    mutate(rs = as.integer64(str_pad(substr(rs, 1, 4), width = 11, side = "right", pad = "0"))) %>%
    group_by(rs, votetype_id) %>%
    summarise(
      votes_eligible = sum(votes_eligible, na.rm = TRUE),
      voters = sum(voters, na.rm = TRUE),
      invalid_ballots = sum(invalid_ballots, na.rm = TRUE),
      valid_ballots = sum(valid_ballots, na.rm = TRUE),
      votes_cast = sum(votes_cast, na.rm = TRUE)
    )%>%
    mutate(turnout = voters / votes_eligible) %>%
    mutate(date=date)%>%
    mutate(election_type=election_type)
  
  
  kreis_sum_results_party<-selected_results_party %>% 
    mutate(rs = as.integer64(str_pad(substr(rs, 1, 4), width = 11, side = "right", pad = "0"))) %>%
    group_by(rs, votetype_id, party_family_id,color) %>%
    summarise(vote_count = sum(vote_count, na.rm = TRUE)) %>%
    left_join(kreis_sum_results_meta %>% select(rs, votetype_id, votes_cast), by = c("rs", "votetype_id")) %>%
    mutate(vote_percent = vote_count / votes_cast) %>%
    select(-votes_cast) %>%
    mutate(date=date)%>%
    mutate(election_type=election_type)
  
  insert_to_db_new(database,"election_result_aggregate_meta_region",kreis_sum_results_meta,c("rs","election_type","date","votetype_id"))
  insert_to_db_new(database,"election_result_aggregate_party_region",kreis_sum_results_party,c("party_family_id","rs","election_type","date","votetype_id"))
  
  
  #And finally for the Regierungsbezirke
  reg_sum_results_meta <- selected_results_meta %>%
    #This is cutting the Regionalschlüssel to the 2nd position and filling the rest with zeros to get the Kreis of each place
    mutate(rs = as.integer64(str_pad(substr(rs, 1, 2), width = 11, side = "right", pad = "0"))) %>%
    group_by(rs, votetype_id) %>%
    summarise(
      votes_eligible = sum(votes_eligible, na.rm = TRUE),
      voters = sum(voters, na.rm = TRUE),
      invalid_ballots = sum(invalid_ballots, na.rm = TRUE),
      valid_ballots = sum(valid_ballots, na.rm = TRUE),
      votes_cast = sum(votes_cast, na.rm = TRUE)
    )%>%
    mutate(turnout = voters / votes_eligible) %>%
    mutate(date=date)%>%
    mutate(election_type=election_type)
  
  
  reg_sum_results_party<-selected_results_party %>% 
    mutate(rs = as.integer64(str_pad(substr(rs, 1, 2), width = 11, side = "right", pad = "0"))) %>%
    group_by(rs, votetype_id, party_family_id,color) %>%
    summarise(vote_count = sum(vote_count, na.rm = TRUE)) %>%
    left_join(reg_sum_results_meta %>% select(rs, votetype_id, votes_cast), by = c("rs", "votetype_id")) %>%
    mutate(vote_percent = vote_count / votes_cast) %>%
    select(-votes_cast) %>%
    mutate(date=date)%>%
    mutate(election_type=election_type)
  
  insert_to_db_new(database,"election_result_aggregate_meta_region",reg_sum_results_meta,c("rs","election_type","date","votetype_id"))
  insert_to_db_new(database,"election_result_aggregate_party_region",reg_sum_results_party,c("party_family_id","rs","election_type","date","votetype_id"))
  
  
  ##And if we have a Bundestags or Landtagswahl do the Wahlkreise as well
  if(election_type %in% c(2, 3)){
    #Get all Vote District Mapping
    query<-sqlInterpolate(database,"SELECT * FROM election_vote_district_mapping
                                  WHERE election_type = ?type AND date =?date",
                          type=election_type,date=date)
    selected_district_mapping<-dbGetQuery(database,query)
    ##Get all cities where we have more than one district
    cities_mult_district<-selected_district_mapping%>%filter(!is.na(ps_id))%>%select(rs)%>%unique()
    ##First handle the cities with multiple districts
    
    selected_results_meta_dis <- selected_results_meta %>%
      left_join(selected_district_mapping%>%select(rs,ps_id,district_id),by = c("rs","ps_id"))
    
    ##Than the rest
    missing_rows <- selected_results_meta_dis %>%
      filter(!(rs %in% cities_mult_district$rs) & is.na(district_id))%>%
      select(-district_id) %>%
      left_join(selected_district_mapping %>% select(rs, district_id), by = "rs")
    
    # Combine the two results, replacing rows with missing `district_id` with retried ones
    selected_results_meta_dis <- selected_results_meta_dis %>%
      filter(!(!(rs %in% cities_mult_district$rs) & is.na(district_id))) %>%
      bind_rows(missing_rows)
    
    
    
    
    if(sum(is.na(selected_results_meta_dis$district_id))!=0){
      #In this case we have entries where we could not determine the correct District. 
      #Do it manually
      #For this we need the names of the Polling-Stations
      query<-sqlInterpolate(database,"SELECT * FROM public.polling_stations 
                            where rs = 81110000000 AND election_id = ?id AND date =?date",
                            date=date,id=selected_results_meta_dis$election_id[1])
      selected_polling_stations<-dbGetQuery(database,query)
      selected_results_meta_dis<-selected_results_meta_dis %>%
        left_join(selected_polling_stations %>% select(ps_id, name, rs), by = c("rs", "ps_id")) %>%
        mutate(
          district_id = case_when(
            #According to documentation this is the official determination what District the PS is in
            is.na(district_id) & str_starts(name, "001|002|004|005|007|009|011|012|016|017|020") ~ 258,
            is.na(district_id) ~ 259,
            TRUE ~ district_id
          )
        ) %>% select(-name)
    }
    
    ##Now that we have the complete list of districts also use that for the Party-Data
    
    selected_results_party_dis<-selected_results_party %>%
      left_join(selected_results_meta_dis%>%select(rs,ps_id,votetype_id,district_id),by = c("rs","ps_id","votetype_id"))
    
    
    
    dis_sum_results_meta<-selected_results_meta_dis %>%
      group_by(district_id, votetype_id) %>%
      summarise(
        votes_eligible = sum(votes_eligible, na.rm = TRUE),
        voters = sum(voters, na.rm = TRUE),
        invalid_ballots = sum(invalid_ballots, na.rm = TRUE),
        valid_ballots = sum(valid_ballots, na.rm = TRUE),
        votes_cast = sum(votes_cast, na.rm = TRUE)
      )%>%
      mutate(turnout = voters / votes_eligible) %>%
      mutate(date=date)%>%
      mutate(election_type=election_type)
    
    
    dis_sum_results_party<-selected_results_party_dis %>% 
      group_by(district_id, votetype_id, party_family_id,color) %>%
      summarise(vote_count = sum(vote_count, na.rm = TRUE)) %>%
      left_join(dis_sum_results_meta %>% select(district_id, votetype_id, votes_cast), by = c("district_id", "votetype_id")) %>%
      mutate(vote_percent = vote_count / votes_cast) %>%
      select(-votes_cast) %>%
      mutate(date=date)%>%
      mutate(election_type=election_type)
    
    insert_to_db_new(database,"election_result_aggregate_meta_district",dis_sum_results_meta,c("district_id","election_type","date","votetype_id"))
    insert_to_db_new(database,"election_result_aggregate_party_district",dis_sum_results_party,c("party_family_id","district_id","election_type","date","votetype_id"))
    
     
  }
  
  
}

##Create Mapping information out of GEO-JSON file for Stuttgart

update_mapping_stuttgart<-function(database,geo_stuttgart,election_date,election_type){
  setDT(geo_stuttgart)
  mapping_rows<-data.table(rs=as.integer64(),election_type=as.numeric(),date=as.Date(NULL),ps_id=as.integer(),ps_id_postal=as.integer())
  #Get all polling stations from Stuttgart for that election
  query<-sqlInterpolate(database,"SELECT DISTINCT ps.*
                                  FROM polling_stations ps
                                  JOIN elections e ON e.election_id = ps.election_id AND e.rs = ps.rs
                                  WHERE e.election_type = ?type AND e.date =?date AND e.rs = '81110000000'",
                        type=election_type,date=election_date)
  stuttgart_ps<-dbGetQuery(database,query)
  #Get all election results for Stuttgart for that election
  query<-sqlInterpolate(database,"SELECT DISTINCT er.* , e.election_type, p.name_short, p.party_family_id, p.color
                                  FROM election_result er
                                  JOIN elections e ON e.election_id = er.election_id AND e.rs = er.rs
                                  LEFT JOIN election_party_family epf on er.rs=epf.rs AND er.election_id=epf.election_id AND er.party_id=epf.party_id
						                      LEFT JOIN party p ON epf.party_family_id=p.party_family_id
                                  WHERE e.election_type = ?type AND e.date =?date AND e.rs = '81110000000'",
                        type=election_type,date=election_date)
  selected_results_party<-dbGetQuery(database,query)
  query<-sqlInterpolate(database,"SELECT DISTINCT erp.* , e.election_type
                                  FROM election_result_ps erp
                                  JOIN elections e ON e.election_id = erp.election_id AND e.rs = erp.rs
                                  WHERE e.election_type = ?type AND e.date =?date AND e.rs = '81110000000'",
                        type=election_type,date=election_date)
  selected_results_meta<-dbGetQuery(database,query)
  
  
  
  ##Go through all entries in the geo file and update data
  for (i in 1:nrow(geo_stuttgart)) {
    cur_geo_stuttgart<-geo_stuttgart[i]
    #Now select the respective postal and in-person polling station
    cur_postal<-stuttgart_ps%>%filter(str_starts(name,cur_geo_stuttgart$BWBEZ_T))%>%select(ps_id)%>%as.integer()
    cur_in_person<-stuttgart_ps%>%filter(str_starts(name,cur_geo_stuttgart$AWBEZ_T))%>%select(ps_id)%>%as.integer()
    ##Build Line to update
    cur_mapping_row<-data.table(rs=as.integer64(81110000000),election_type=election_type,date=election_date,ps_id=cur_in_person,ps_id_postal=cur_postal)
    mapping_rows<-rbind(mapping_rows,cur_mapping_row)
    ##Input
    insert_to_db(database,"election_ps_postal_mapping",cur_mapping_row)
    
    ##For Bundes and Landtagswahl update references to election districts
    if(election_type == 2){
      cur_district<-cur_geo_stuttgart$BWKNUM_T
      cur_mapping_row<-data.table(rs=as.integer64(81110000000),election_type=election_type,date=election_date,ps_id=cur_in_person,district_id=cur_district)
      insert_to_db(database,"election_vote_district_mapping",cur_mapping_row)
      cur_mapping_row<-data.table(rs=as.integer64(81110000000),election_type=election_type,date=election_date,ps_id=cur_postal,district_id=cur_district)
      insert_to_db(database,"election_vote_district_mapping",cur_mapping_row)
      
    }else if (election_type == 3){
      cur_district<-cur_geo_stuttgart$LWKNUM_T
      cur_mapping_row<-data.table(rs=as.integer64(81110000000),election_type=election_type,date=election_date,ps_id=cur_in_person,district_id=cur_district)
      insert_to_db(database,"election_vote_district_mapping",cur_mapping_row)
      cur_mapping_row<-data.table(rs=as.integer64(81110000000),election_type=election_type,date=election_date,ps_id=cur_postal,district_id=cur_district)
      insert_to_db(database,"election_vote_district_mapping",cur_mapping_row)  
      }
    
    ##Now aggregate the Metainfo and Partyinfo for every combination of in-person and postal station
    ps_sum_results_meta <- selected_results_meta %>%
      filter(ps_id %in% c(cur_in_person,cur_postal)) %>%
      group_by(rs, votetype_id) %>%
      summarise(
        votes_eligible = sum(votes_eligible, na.rm = TRUE),
        voters = sum(voters, na.rm = TRUE),
        invalid_ballots = sum(invalid_ballots, na.rm = TRUE),
        valid_ballots = sum(valid_ballots, na.rm = TRUE),
        votes_cast = sum(votes_cast, na.rm = TRUE)
      )%>%
      mutate(ps_id=cur_in_person)%>%
      mutate(turnout = voters / votes_eligible) %>%
      mutate(date=election_date)%>%
      mutate(election_type=election_type)
    
    
    ps_sum_results_party<-selected_results_party %>% 
      filter(ps_id %in% c(cur_in_person,cur_postal)) %>%
      group_by(rs, votetype_id, party_family_id,color) %>%
      summarise(vote_count = sum(vote_count, na.rm = TRUE)) %>%
      left_join(ps_sum_results_meta %>% select(rs, votetype_id, votes_cast), by = c("rs", "votetype_id")) %>%
      mutate(vote_percent = vote_count / votes_cast) %>%
      select(-votes_cast) %>%
      mutate(ps_id=cur_in_person)%>%
      mutate(date=election_date)%>%
      mutate(election_type=election_type)
    
    insert_to_db(database,"election_result_aggregate_meta_ps",ps_sum_results_meta)
    insert_to_db(database,"election_result_aggregate_party_ps",ps_sum_results_party)
    
    
    
    
    
  }
  
}
    
  
  
  

