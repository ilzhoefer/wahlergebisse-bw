#Get all Election Dates
shiny_get_election_types<-function(database){
  dbGetQuery(database,"SELECT DISTINCT et.election_type, et.election_description 
            FROM election_result_ps erp
            JOIN elections e ON erp.election_id = e.election_id
            JOIN election_type et ON e.election_type = et.election_type
            ORDER BY et.election_type;"
            )
  
}
shiny_get_election_dates<-function(database,type_id){
  query<-sqlInterpolate(conn=database,"SELECT DISTINCT e.date
            FROM elections e
            JOIN election_result_ps erp ON erp.election_id = e.election_id
            where e.election_type = ?type
            ORDER BY e.date DESC;",type=type_id)
  dbGetQuery(database,query)
  
}
shiny_get_all_election_dates<-function(database){
  query<-sqlInterpolate(conn=database,"SELECT DISTINCT e.election_type,e.date
            FROM elections e
            JOIN election_result_ps erp ON erp.election_id = e.election_id
            ORDER BY e.date;",type=type_id)
  dbGetQuery(database,query)
  
}
shiny_return_possible_map_modes<-function(type_id){
  if(type_id %in% c(1, 5, 6)) {
    possible_modes <- c("Regierungsbezirk", "Kreis", "Gemeinde", "Wahlbezirk")
  } else if(type_id == 4) {
    possible_modes <- c("Kreis", "Gemeinde", "Wahlbezirk")
  } else if(type_id %in% c(2, 3)) {
    possible_modes <- c("Wahlkreis", "Regierungsbezirk", "Kreis", "Gemeinde", "Wahlbezirk")
  }
  
  if(type_id == 6) {
    selected_mode <- "Gemeinde"
  } else if(type_id %in% c(1, 4, 5)) {
    selected_mode <- "Kreis"
  } else if(type_id %in% c(2, 3)) {
    selected_mode <- "Wahlkreis"
  }
  return(list(possible_modes=possible_modes,selected_mode=selected_mode))
  
}
##Return the Parties that should be avaliable
shiny_get_parties<-function(database,election_date,election_type){
  query <- paste0("SELECT er.*, p.name_short
            FROM public.election_result_aggregate_party_region er
            JOIN party p ON er.party_family_id = p.party_family_id
            WHERE er.election_type = ?type AND er.date = ?date")
  # Now interpolate the parameters for the SQL query
  query <- sqlInterpolate(conn = database, query,
                        type = election_type,
                        date = election_date)

  raw_information<-dbGetQuery(database,query)%>%select(c(name_short,party_family_id))%>%unique()
  return(raw_information)
}

##Return the polygons that should be shown
shiny_reactive_polygons<-function(map_mode,election_type,geo_bw_polygon,geo_bundestag_polygon,geo_landtag_bw_polygon,geo_bezirke_polygon,selected_date){
  if(map_mode=="Regierungsbezirk"){
    polygons<-geo_bw_polygon%>%filter(nchar(de.regionalschluessel)==3)
  }else if(map_mode=="Kreis"){
    polygons<-geo_bw_polygon%>%filter((nchar(de.regionalschluessel)==5)|endsWith(de.regionalschluessel, "0000000"))
  }else if(map_mode=="Gemeinde"){
    polygons<-geo_bw_polygon%>%filter(nchar(de.regionalschluessel)==12)
  }else if(map_mode=="Wahlkreis"){
    #Depending on Landtag or Bundestag
    if(election_type==2){
      polygons<-geo_bundestag_polygon
    }else if(election_type==3){
      polygons<-geo_landtag_bw_polygon
    }
  }else if(map_mode=="Wahlbezirk"){
    polygons<-geo_bezirke_polygon%>%filter(date==selected_date)
  }else {
    polygons<-geo_bw_polygon%>%filter((nchar(de.regionalschluessel)==5)|endsWith(de.regionalschluessel, "0000000"))
  }
  if(election_type==4){
    #Regional elections only exist in Region Stuttgart
    polygons<-polygons%>%filter(startsWith(de.regionalschluessel,"0811"))
  }
  
  return(polygons)
  
}

##Return the Map info mode
shiny_map_information<-function(database,selected_map_information,selected_map_mode,selected_election_type,selected_date,selected_party){
  # Select the database based on the selected map mode
  if (selected_map_mode == "Wahlkreis") {
    database_meta <- "election_result_aggregate_meta_district"
    database_party <- "election_result_aggregate_party_district"
  } else {
    database_meta <- "election_result_aggregate_meta_region"
    database_party <- "election_result_aggregate_party_region"
  }
  
  # Build the query based on the selected map information
  if (selected_map_information == "Wahlbeteiligung") {
    query <- paste0("SELECT *
            FROM ", database_meta, "
            WHERE election_type = ?type AND date = ?date")
    
  } else {
    query <- paste0("SELECT er.*, p.name_short
            FROM ", database_party, " er
            JOIN party p ON er.party_family_id = p.party_family_id
            WHERE er.election_type = ?type AND er.date = ?date")
  }
  
  # Now interpolate the parameters for the SQL query
  query <- sqlInterpolate(conn = database, query,
                          type = selected_election_type,
                          date = selected_date)
  
  raw_information<-dbGetQuery(database,query)
  
  if(selected_map_information=="Stärkste Partei"){
    if (selected_map_mode == "Wahlkreis"){
      return<-raw_information%>%
        group_by(district_id,votetype_id)%>%
        slice_max(vote_percent)
    }else{
      return<-raw_information%>%
        group_by(rs,votetype_id)%>%
        slice_max(vote_percent)
    }
    
    
    
  }else if(selected_map_information=="2. Stärkste Partei"){
    if (selected_map_mode == "Wahlkreis"){
      return<-raw_information%>%
        group_by(district_id,votetype_id)%>%
        slice_max(vote_percent,n=2)
    }else{
      return<-raw_information%>%
        group_by(rs,votetype_id)%>%
        slice_max(vote_percent,n=2)
    }
  }else if(selected_map_information=="Wahlbeteiligung"){
    return<-raw_information
  }else if(selected_map_information=="Hochburg"){
    return<-raw_information%>%filter(name_short==selected_party)
  }
  return(return)
  
  
}

##Return the Map info mode
shiny_map_information_ps<-function(database,selected_map_information,selected_map_mode,selected_election_type,selected_date,selected_party){
  ##Select the Database from where the Information should come
  if(selected_map_mode=="Wahlbezirk"){
    database_meta<-"election_result_aggregate_meta_ps"
    database_party<-"election_result_aggregate_party_ps"
  }else{
    database_meta<-"election_result_aggregate_meta_ps"
    database_party<-"election_result_aggregate_party_ps"
  }
  
  
  
  if (selected_map_information == "Wahlbeteiligung") {
    query <- paste0("SELECT DISTINCT er.*, ps.name
            FROM ", database_meta, " er
            JOIN polling_stations ps ON er.ps_id = ps.ps_id AND er.rs = ps.rs AND er.date = ps.date
            WHERE er.election_type = ?type AND er.date = ?date")
  } else {
    query <- paste0("SELECT DISTINCT er.*, p.name_short, ps.name
            FROM ", database_party, " er
            JOIN party p ON er.party_family_id = p.party_family_id
            JOIN polling_stations ps ON er.ps_id = ps.ps_id AND er.rs = ps.rs AND er.date = ps.date
            WHERE er.election_type = ?type AND er.date = ?date")
    # Now interpolate the parameters for the SQL query
    
  }
  
  query <- sqlInterpolate(conn = database, query,
                          type = selected_election_type,
                          date = selected_date)
  
  raw_information<-dbGetQuery(database,query)
  
  if(selected_map_information=="Stärkste Partei"){
    return<-raw_information%>%
      group_by(rs,ps_id,votetype_id)%>%
      slice_max(vote_percent)
    
  }else if(selected_map_information=="2. Stärkste Partei"){
    return<-raw_information%>%
      group_by(rs,ps_id,votetype_id)%>%
      slice_max(vote_percent,n=2)
  }else if(selected_map_information=="Wahlbeteiligung"){
    return<-raw_information
  }else if(selected_map_information=="Hochburg"){
    return<-raw_information%>%filter(name_short==selected_party)
  }
  return(return)
  
  
}

##Count the number of tailing 0
count_trailing_zeros <- function(x) {
  as.character(x) %>%      
    sub(".*[^0](0*)$", "\\1", .) %>%  # Extract trailing zeros using regex
    nchar()                         # Count the number of trailing zeros
}

#Combine Polygons and information based on map mode
shiny_combine_polygons_information<-function(selected_map_information,selected_map_mode,polygons,information){
  if(selected_map_information == "Wahlbeteiligung"){
    
    
    if(selected_map_mode %in% c("Regierungsbezirk","Kreis","Gemeinde")){
      map_information<-polygons%>%left_join(information%>%select(rs,turnout),by="rs")%>%
        mutate(label=sprintf("<strong>%s</strong><br/>Wahlbeteiligung: %.2f%%", name, round(turnout, 4)*100) %>% lapply(htmltools::HTML))
      
      
    }else if(selected_map_mode == "Wahlbezirk"){
      map_information<-polygons %>% left_join(information%>% 
                                                mutate(name_prefix = substr(name, 1, 6)) %>%
                                                select(rs,turnout,ps_id,name,name_prefix)
                                              ,by = c("AWBEZ_T" = "name_prefix")) %>%
        mutate(label=sprintf("<strong>%s</strong><br/>Wahlbeteiligung: %.2f%%", name, round(turnout, 4)*100) %>% lapply(htmltools::HTML))
      
      
    }else if(selected_map_mode == "Wahlkreis"){
      map_information<-polygons%>%left_join(information%>%select(district_id,turnout)%>%mutate(ref=as.character(district_id)),by="ref") %>%
        mutate(label=sprintf("<strong>%s</strong><br/>Wahlbeteiligung: %.2f%%", name, round(turnout, 4)*100) %>% lapply(htmltools::HTML))
    }else{
      map_information<-polygons%>%
        mutate(label=NA)%>%
        mutate(color=NA)
    }
    
    #Define color scale
    color_scale_participation <- shiny_colorscale_turnout(map_information$turnout)
    map_information<-map_information%>%mutate(color= color_scale_participation(turnout * 100))
    
    
  }else if(selected_map_information %in% c("Stärkste Partei","2. Stärkste Partei")){
    if(selected_map_mode %in% c("Regierungsbezirk","Kreis","Gemeinde")){
      map_information<-polygons%>%left_join(information%>%select(rs,color,name_short,vote_percent),by="rs")%>%
        mutate(label=sprintf("<strong>%s</strong><br/>%s<br/>%.2f%%", name, name_short, round(vote_percent, 4)*100) %>% lapply(htmltools::HTML))
    }else if(selected_map_mode == "Wahlbezirk"){
      map_information<-polygons %>% left_join(information%>% 
                                                mutate(name_prefix = substr(name, 1, 6)) %>%
                                                select(rs,color,name_short,vote_percent,ps_id,name,name_prefix)
                                              ,by = c("AWBEZ_T" = "name_prefix")) %>%
        mutate(label=sprintf("<strong>%s</strong><br/>%s<br/>%.2f%%", name, name_short, round(vote_percent, 4)*100) %>% lapply(htmltools::HTML))
      
    }else if(selected_map_mode == "Wahlkreis"){
      map_information<-polygons%>%left_join(information%>%select(district_id,color,name_short,vote_percent)%>%mutate(ref=as.character(district_id)),by="ref") %>%
        mutate(label=sprintf("<strong>%s</strong><br/>%s<br/>%.2f%%", name, name_short, round(vote_percent, 4)*100) %>% lapply(htmltools::HTML))
    }else{
      map_information<-polygons%>%
        mutate(label=NA)%>%
        mutate(color=NA)
    }
  }else if(selected_map_information == "Hochburg"){
    if(selected_map_mode %in% c("Regierungsbezirk","Kreis","Gemeinde")){
      map_information<-polygons%>%left_join(information%>%select(rs,color,name_short,vote_percent),by="rs")%>%
        mutate(
          label = if_else(
            is.na(vote_percent),
            sprintf("<strong>%s</strong><br/>Partei %s ist nicht angetreten", name, information$name_short[1]),
            sprintf("<strong>%s</strong><br/>Ergebnis %s: %.2f%%", name, name_short, round(vote_percent, 4) * 100)
          ) %>% lapply(htmltools::HTML)
        )
      
      
    }else if(selected_map_mode == "Wahlbezirk"){
      map_information<-polygons %>% left_join(information%>% 
                                                mutate(name_prefix = substr(name, 1, 6)) %>%
                                                select(rs,color,name_short,vote_percent,ps_id,name,name_prefix)
                                              ,by = c("AWBEZ_T" = "name_prefix")) %>%
        mutate(
          label = if_else(
            is.na(vote_percent),
            sprintf("<strong>%s</strong><br/>Partei %s ist nicht angetreten", name, information$name_short[1]),
            sprintf("<strong>%s</strong><br/>Ergebnis %s: %.2f%%", name, name_short, round(vote_percent, 4) * 100)
          ) %>% lapply(htmltools::HTML)
        )
      
      
    }else if(selected_map_mode == "Wahlkreis"){
      map_information<-polygons%>%left_join(information%>%select(district_id,color,name_short,vote_percent)%>%mutate(ref=as.character(district_id)),by="ref") %>%
        mutate(
          label = if_else(
            is.na(vote_percent),
            sprintf("<strong>%s</strong><br/>Partei %s ist nicht angetreten", name, information$name_short[1]),
            sprintf("<strong>%s</strong><br/>Ergebnis %s: %.2f%%", name, name_short, round(vote_percent, 4) * 100)
          ) %>% lapply(htmltools::HTML)
        )
    }else{
      map_information<-polygons%>%
        mutate(label=NA)%>%
        mutate(color=NA)
    }
    orig_color <- na.omit(map_information$color)[1]
    map_information <- map_information %>% mutate(orig_color=orig_color)
    # Define Scale
    color_scale<-shiny_colorscale_party(na.omit(map_information$vote_percent),orig_color)

    map_information <- map_information %>%
      mutate(color = color_scale(vote_percent * 100))
    
  }
  
  return(map_information)
  
}

##Define Color Scale for Turnout
shiny_colorscale_turnout<-function(turnout){
  #Define color scale
  color_scale_participation <- colorNumeric(
    palette = "Blues", 
    domain = turnout * 100 
  )
  return(color_scale_participation)
}

shiny_colorscale_party<-function(vote_percent,color){
  orig_color <- color
  # Define endpoint of color schema
  end_color <- darken(orig_color, amount = 0.5)
  
  # calculate a lighter color
  light_color <- lighten(orig_color, amount = 0.5)
  
  # Define Pallet
  custom_palette <- colorRampPalette(c(light_color, end_color))
  
  # Define Scale
  color_scale_custom <- colorNumeric(
    palette = custom_palette(100),
    domain = vote_percent * 100,
    na.color = NA
  )
  return(color_scale_custom)
}


##Get all Information for the Download
data_get_all_information<-function(database,data_cities,data_election,data_meta,data_aggregate,data_ps,data_meta_ps,data_person){
  
}
