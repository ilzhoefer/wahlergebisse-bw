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
    return<-data.table(id=numeric(),title=character(),votetype=numeric(),votetype_name=character())
    for (i in seq_along(elid_wahleintraege)) {
      cur_wahleintrag<-elid_wahleintraege[[i]]
      return<-rbind(return,
                    data.table(id=as.numeric(cur_wahleintrag$wahl$id),title=as.character(cur_wahleintrag$wahl$titel),
                               votetype=as.numeric(cur_wahleintrag$stimmentyp$id),votetype_name=as.character(cur_wahleintrag$stimmentyp$titel)))
      
      }
  
  
  }else{
    return<-elid_get$status_code
  }
  return(return)
}

#Get Election Results for one election and City
get_results_city<-function(city,election){
  ##Soon do be
  
}


#Get Election Results for one Polling station for one specific date and election
get_results_single_ps<-function(polling_station,election,ags,rep){
  result_url<-sprintf("https://wahlergebnisse.komm.one/lb/produktion/wahltermin-%s/%08d/daten/api/wahl_%d/ergebnis_ebene_6_id_%d_%d.json"
                      ,format(election$date,"%Y%m%d"),ags,election$election_id,polling_station$ps_id,election$votetype_id)
  result_get<-GET(result_url)
  result_content<-content(result_get)
  results_rows<-result_content$Komponente$tabelle$zeilen
  ##It is possible that for some polling stations there is no result
  if(is.null(results_rows)){
    return(paste0("Results for polling station ",polling_station$ps_id," not avaliable. Skip"))
    break
  }
  #Get different Data depending on Postal or not
  if(polling_station$is_postal){
    metadata<-data.table(votes_eligible=NA,
                         voters=parse_number(result_content$Komponente$info$tabelle$zeilen[[1]]$zahl,locale=locale(decimal_mark=",")),
                         invalid_ballots=parse_number(result_content$Komponente$info$tabelle$zeilen[[2]]$zahl,locale=locale(decimal_mark=",")),
                         valid_ballots=parse_number(result_content$Komponente$info$tabelle$zeilen[[3]]$zahl,locale=locale(decimal_mark=",")),
                         votes_cast=parse_number(result_content$Komponente$info$tabelle$zeilen[[4]]$zahl,locale=locale(decimal_mark=",")),
                         turnout=parse_number(result_content$Komponente$info$tabelle$zeilen[[1]]$prozent,locale=locale(decimal_mark=",")))
    
  }else{
    metadata<-data.table(votes_eligible=parse_number(result_content$Komponente$info$tabelle$zeilen[[1]]$zahl,locale=locale(decimal_mark=",")),
                         voters=parse_number(result_content$Komponente$info$tabelle$zeilen[[2]]$zahl,locale=locale(decimal_mark=",")),
                         invalid_ballots=parse_number(result_content$Komponente$info$tabelle$zeilen[[3]]$zahl,locale=locale(decimal_mark=",")),
                         valid_ballots=parse_number(result_content$Komponente$info$tabelle$zeilen[[4]]$zahl,locale=locale(decimal_mark=",")),
                         votes_cast=parse_number(result_content$Komponente$info$tabelle$zeilen[[5]]$zahl,locale=locale(decimal_mark=",")),
                         turnout=parse_number(result_content$Komponente$info$tabelle$zeilen[[2]]$prozent,locale=locale(decimal_mark=",")))
    
  }
  #only include party data for the first call per city
  if(rep==1){
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
                      vote2_count=as.numeric(NULL),vote2_percent=as.numeric(NULL),candidate_name=as.character(NULL),
                      candidate_occupdation=as.character(NULL),candidate_age=as.numeric(NULL))

  for (i in seq_along(results_rows)) {
    cur_party<-results_rows[[i]]
    if(rep==1){
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
    for (j in seq_along(results_persons)) {
      cur_person<-results_persons[[j]]
      results<-rbind(results,data.table(party_id=as.numeric(i),
                                        vote_count=parse_number(cur_person$zahl,locale=locale(decimal_mark=",")),
                                        vote_percent=parse_number(cur_person$prozent,locale=locale(decimal_mark=",")),
                                        candidate_name=as.character(cur_person$label$labelKurz)),fill=TRUE)
    }
    
  }
  return(list(results=results,results_party=results_party,metadata=metadata))
}







