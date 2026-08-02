##This Shiny app was built by Maximilian Ilzhöfer for his Master's Thsis
##It displays in a map mode all election results in Baden-Württemberg since 2021




# Getting the path of your current open file
#current_path = rstudioapi::getActiveDocumentContext()$path 
#setwd(dirname(current_path ))

library(shiny)
library(shinyjqui)
library(shinydashboard)
library(shinyWidgets)
library(shinydashboardPlus)
library(shinyAce)
library(styler)
library(shinyEffects)
library(DT)
library(plotly)
library(rjson)
library(pool)
library(tidygeocoder)
library(dplyr)
library(tidyr)
library(leaflet)
library(RPostgres)
library(shinythemes)
library(data.table)
library(sf)
library(bit64)
library(stringr)
library(colorspace)

source("new_data_functions.R")
source("shiny_functions.R")
source("shiny_helpers.R")

options(shiny.host = "0.0.0.0")
options(shiny.port = 8888)

#get environmaltal variables
DB_PASS<-Sys.getenv("DB_PASS")


database <- dbPool(
  drv = dbDriver("Postgres"),
  dbname = "election",
  host = "db",
  #host = "localhost",
  user = "election",
  password = DB_PASS,
  idleTimeout = 3600000
)

##Define some Data
all_election_types<-shiny_get_election_types(database)%>%filter(election_type%in%c(1,2,3,4,5,6))
avaliable_elections<-all_election_types%>%left_join(shiny_get_all_election_dates(database))%>%mutate(descriptionDE=paste(election_description,format(date, "%d.%m.%Y")))
  
##Define all Map Data modes
map_data_modes<-(c("Stärkste Partei","2. Stärkste Partei","Wahlbeteiligung","Hochburg"))

#get all cities
query <- paste0("SELECT * from cities")
cities <- dbGetQuery(database, query)
setDT(cities)

geo_bundestag<-st_read("./data/Bundestag.geojson")
geo_bundestag_polygon<-geo_bundestag[st_geometry_type(geo_bundestag) %in% c("POLYGON", "MULTIPOLYGON"),]
geo_landtag_bw<-st_read("./data/Landtag_BW.geojson")
geo_landtag_bw_polygon<-geo_landtag_bw[st_geometry_type(geo_landtag_bw) %in% c("POLYGON", "MULTIPOLYGON"),]
geo_bw <- st_read("./data/Baden_Wuerttemberg_small.geojson")
geo_bw_polygon<-geo_bw[st_geometry_type(geo_bw) %in% c("POLYGON", "MULTIPOLYGON"),]
geo_bw_polygon<-geo_bw_polygon%>%mutate(rs=as.integer64(str_pad(de.regionalschluessel, width = 12, side = "right", pad = "0")))
#As the Areas in Stuttgart change include the Date from when the Areas are
geo_stuttgart_2025 <- st_read("./data/Stuttgart_Bezirke_2025.geojson") %>% mutate(date=as.Date('2025-02-23'))
geo_stuttgart_2024 <- st_read("./data/Stuttgart_Bezirke_2024.geojson") %>% mutate(date=as.Date('2024-06-09'))
geo_stuttgart_2021 <- st_read("./data/Stuttgart_Bezirke_2021.geojson") %>% mutate(date=as.Date('2021-09-26'),LWKNUM_T=NA,LWKNAM_T=NA)
geo_stuttgart_combined<-rbind(geo_stuttgart_2021,geo_stuttgart_2024,geo_stuttgart_2025)
geo_stuttgart_polygon<-geo_stuttgart_combined[st_geometry_type(geo_stuttgart_combined) %in% c("POLYGON", "MULTIPOLYGON"),]%>%mutate(id=AWBEZ_T)
geo_bezirke_polygon<-geo_stuttgart_polygon

cat(getwd())
ui <- bootstrapPage(
  tags$head(
    tags$link(rel = "icon", type = "image/x-icon", href = "favicon.png")
  ),
  navbarPage(theme = shinytheme("flatly"), collapsible = TRUE,
             HTML('<a style="text-decoration:none;cursor:default;color:#FFFFFF;" class="active" href="#">Wahl-Dashboard</a>'), id="nav",
             windowTitle = "Wahl-Dashboard",
             
             tabPanel("Karte",
                      div(class="outer",
                          tags$head(includeCSS("styles.css")),
                          leafletOutput("electionmap", width="100%", height="100%"),
                          
                          absolutePanel(id = "controls", class = "panel panel-default",
                                        top = 75, left = 55, width = 250, fixed=TRUE,
                                        draggable = TRUE, height = "auto",
                                        selectInput("input_election_type", selected = all_election_types$election_description[1], choices = all_election_types$election_description, label = "Wahlart"),
                                        selectInput("input_election_date", selected = NULL, choices = NULL, label = "Wahldatum"),
                                        conditionalPanel(
                                          condition = "input.input_election_type == 'Bundestagswahl' || 
                                                       input.input_election_type == 'Landtagswahl'",
                                          selectInput("input_vote_type", choices = c("Erststimmen", "Zweitstimmen"), selected="Erststimmen", label = "Stimmtyp")
                                        ),
                                        selectInput("input_map_region_mode", selected = NULL, choices = NULL, label = "Kartengenauigkeit"),
                                        selectInput("input_map_visual_mode", selected = NULL, choices = map_data_modes, label = "Informationsmodus"),
                                        conditionalPanel(
                                          condition = "input.input_map_visual_mode == 'Hochburg'",
                                          selectInput("input_party", choices = c(""), label = "Partei")
                                        )
                          )
                      )
             ),
             tabPanel("Daten",
                      pickerInput(
                        inputId = "data_cities", label = "Gemeinden",
                        choices = cities$name,
                        selected = cities$name,
                        options = list(`actions-box` = TRUE, `selected-text-format` = "count > 2",
                                       `count-selected-text` = "{0}/{1} Gemeinden",`live-Search`=TRUE,`live-Search-Normalize`=TRUE,`live-Search-Style`="contains"),
                        multiple = TRUE
                      ),
                        pickerInput(
                        inputId = "data_election", label = "Wahl",
                        choices = avaliable_elections$descriptionDE,
                        selected = avaliable_elections$descriptionDE[1],
                        options = list(`actions-box` = TRUE, `selected-text-format` = "count > 2",
                                       `count-selected-text` = "{0}/{1} Gemeinden",`live-Search`=TRUE,`live-Search-Normalize`=TRUE,`live-Search-Style`="contains"),
                        multiple = FALSE
                      ),
                      p("Sollen Metainformationen über die Wahlen wie Wahlbeteiligung mit exportiert werden?"),
                      switchInput(inputId = "data_meta", value = TRUE,onLabel = "Ja",offLabel = "Nein"),
                      p("Sollen Aggrigierte Daten pro Gemeinde exportiert werden?"),
                      switchInput(inputId = "data_aggregate", value = TRUE,onLabel = "Ja",offLabel = "Nein"),
                      p("Sollen Daten pro Wahlbezirk exportiert werden?"),
                      switchInput(inputId = "data_ps", value = TRUE,onLabel = "Ja",offLabel = "Nein"),
                      p("Sollen Metadaten pro Wahlbezirk (Adresse, Barrierefreiheit etc.) exportiert werden?"),
                      switchInput(inputId = "data_meta_ps", value = TRUE,onLabel = "Ja",offLabel = "Nein"),
                      conditionalPanel(
                        condition = "input.data_election && (input.data_election.includes('Gemeinde') || input.data_election.includes('Kreis'))",
                        p("Sollen die Daten pro Kandidat:in aufgeschlüsselt werden? Ansonsten wird pro Patei aggrigiert"),
                        switchInput(inputId = "data_person", value = TRUE,onLabel = "Ja",offLabel = "Nein")
                      ),
                      withBusyIndicatorUI(
                        actionButton(
                          "data_start",
                          "Download vorbereiten",
                          class = "btn-primary"
                        )
                      ),
                      downloadButton(outputId="data_download", label = "Download")),
  )
)






### SHINY SERVER ###

server = function(input, output, session) {
  
  # Reactive to hold election dates
  reactive_election_dates <- reactive({
    selected_election_type <- all_election_types[all_election_types$election_description == input$input_election_type, "election_type"]
    dates <- shiny_get_election_dates(database,selected_election_type)$date
    format(as.Date(dates), "%d.%m.%Y")
    
  })
  
  reactive_map_modes <- reactive({
    selected_election_type <- all_election_types[all_election_types$election_description == input$input_election_type, "election_type"]
    shiny_return_possible_map_modes(selected_election_type)
  })
  
  ##Reactive to hold the current displayed information for 
  reactivemap_data <- reactiveVal(data.frame())
  ##Reactive to hold information on clicked polgons
  reactive_click<-reactiveVal(NULL)
  
  # Update election dates and Map mode when the election type changes
  observeEvent(input$input_election_type, {
    if(input$input_election_date %in% reactive_election_dates()){
      selected_date<-input$input_election_date
    }else{
      selected_date<-reactive_election_dates()[1]
    }
    if(input$input_map_region_mode %in% reactive_map_modes()$possible_modes){
      selected_region<-input$input_map_region_mode
    }else{
      selected_region<-reactive_map_modes()$selected_mode
    }
    
    
    updateSelectInput(session, "input_election_date", choices = reactive_election_dates(), selected = selected_date)
    updateSelectInput(session, "input_map_region_mode", choices = reactive_map_modes()$possible_modes, selected = selected_region)
    
  })
  
  # Update Parties
  observeEvent({
    input$input_election_type
    input$input_election_date
  }, {
    selected_date<-input$input_election_date%>%as.Date(,"%d.%m.%Y")
    selected_election_type <- all_election_types[all_election_types$election_description == input$input_election_type, "election_type"]
    selected_party<-input$input_party
    all_parties<-shiny_get_parties(database,selected_date,selected_election_type)%>%arrange(party_family_id)
    all_parties<-all_parties$name_short
    if(selected_party%in%all_parties){
      selected<-selected_party
    }else{
      selected<-all_parties[1]
    }
    
      # Update der `input_party`-Optionen
      updateSelectInput(
        session = session,
        inputId = "input_party",
        choices = all_parties,
        selected = selected
      )
    }, ignoreInit = TRUE)
  
  #Return the Polygons that should be visible
  reactive_polygons <- reactive({
    selected_election_type <- all_election_types[all_election_types$election_description == input$input_election_type, "election_type"]
    selected_map_mode<-input$input_map_region_mode
    selected_date<-input$input_election_date%>%as.Date(,"%d.%m.%Y")
    
    shiny_reactive_polygons(selected_map_mode,selected_election_type,geo_bw_polygon,geo_bundestag_polygon,geo_landtag_bw_polygon,geo_bezirke_polygon,selected_date)
    
  })
  
  
  
  #Return the Information that should be visible
  reactive_map_information <- reactive({
    selected_map_information <- input$input_map_visual_mode
    selected_map_mode<-input$input_map_region_mode
    selected_election_type <- all_election_types[all_election_types$election_description == input$input_election_type, "election_type"]
    selected_date<-input$input_election_date%>%as.Date(,"%d.%m.%Y")
    selected_party<-input$input_party
    #Depending on the map_mode call different functions
    if(selected_map_mode=="Wahlbezirk"){
      raw_information<-shiny_map_information_ps(database,selected_map_information,selected_map_mode,selected_election_type,selected_date,selected_party)
    }else{
      raw_information<-shiny_map_information(database,selected_map_information,selected_map_mode,selected_election_type,selected_date,selected_party)
    }
    
    
    return(raw_information)
    
    })
  
  # Render the Leaflet map
  output$electionmap <- renderLeaflet({
    selected_election_type <- all_election_types[all_election_types$election_description == input$input_election_type, "election_type"]
    selected_map_information <- input$input_map_visual_mode
    selected_map_mode<-input$input_map_region_mode
    polygons<-reactive_polygons()
    information<-reactive_map_information()
    #If we have Bundes or Landtagswahlen only select for the requested Votetype
    if(selected_election_type==2||selected_election_type==3){
      if(input$input_vote_type=="Erststimmen"){
        information<-information%>%filter(votetype_id==0)
      }else{
        information<-information%>%filter(votetype_id==1)
      }
        
    }
    
    
    #Combine Polygons and information based on map mode
    map_information<-shiny_combine_polygons_information(selected_map_information,selected_map_mode,polygons,information)
    reactive_map_data<<-NULL
    reactive_map_data<<-map_information
    
    basemap <- leaflet() %>%
      addTiles() %>%
      addPolygons(data = map_information,
                  fillColor = ~ifelse(is.na(color), "transparent", color),
                  fillOpacity = ~ifelse(is.na(color), 0, 0.7),
                  color = "blue", 
                  weight = 2, 
                  opacity = 0.7, 
                  highlightOptions = highlightOptions(
                    color = "red", 
                    weight = 3, 
                    bringToFront = TRUE),
                  label = ~ifelse(is.na(label), NA, label),
                  labelOptions = labelOptions(
                    style = list("color" = "black", "font-weight" = "bold"),
                    textsize = "15px",
                    direction = "auto"
                  ),
                  layerId = ~ifelse(is.na(id), NA, id))
    ##Add legend
    if(selected_map_information=="Wahlbeteiligung"){
      basemap<-basemap%>%
        addLegend(
          pal = shiny_colorscale_turnout(map_information$turnout),
          values = map_information$turnout * 100, 
          title = "Wahlbeteiligung (%)",
          position = "bottomright"
        )
    }else if(selected_map_information=="Hochburg"&&sum(!is.na(map_information$vote_percent))!=0){
      basemap<-basemap%>%
        addLegend(
          pal = shiny_colorscale_party(map_information$vote_percent,map_information$orig_color[1]),
          values = map_information$vote_percent * 100, 
          title = paste0("Ergebnis ",input$input_party),
          position = "bottomright"
        )
    }
    
    
    basemap
  })
  
  observeEvent(input$electionmap_shape_click, {
    # Update the reactive variable with the click info
    reactive_click<<-(input$electionmap_shape_click)
    
    # Reset the reactive value after processing
    #click_info(NULL)
  })
  
  
  # Zoom into polygon on click
  observeEvent(input$electionmap_shape_click,{
    click <- input$electionmap_shape_click
    update_map<-FALSE
    
    if (!is.null(click)) {
      
      
      
      # Extract the clicked polygon's bounding box
      selected_polygon <-geo_bw_polygon %>%
        filter(id == click$id) 
      
      
      if (nrow(selected_polygon) > 0) {
        bounds <- st_bbox(selected_polygon) # Calculate bounding box
        bounds_list <- as.list(bounds) # Convert named vector to list
        information<-reactive_map_information()
        selected_map_information <- input$input_map_visual_mode
        selected_map_mode<-input$input_map_region_mode
        ##Only if the selected Polygon has an rs we should go further
        if(!is.null(selected_polygon$rs)){
          #Get the RS
          cur_rs<-selected_polygon$rs
          selected_election_type <- all_election_types[all_election_types$election_description == input$input_election_type, "election_type"]
          #Get all Information that is inside of that Poligon
          if(count_trailing_zeros(cur_rs)==9){#If it has 9 Trailing 0 it is a Regierungsbezirk
            new_information<-information%>%filter(str_starts(rs,cur_rs%>%substr(1,2)))%>%filter(rs!=cur_rs)
            
          }else if (count_trailing_zeros(cur_rs)==7){ #If it has 7 Trailing 0 it is a Kreis
            new_information<-information%>%filter(str_starts(rs,cur_rs%>%substr(1,4)))%>%filter(rs!=cur_rs)
          }else{
            new_information<-data.table(NULL)
          }
          #If we have found new information get the Polygons as well
          if(nrow(new_information)!=0){
            #If we have Bundes or Landtagswahlen only select for the requested Votetype
            if(selected_election_type==2||selected_election_type==3){
              if(input$input_vote_type=="Erststimmen"){
                new_information<-new_information%>%filter(votetype_id==0)
              }else{
                new_information<-new_information%>%filter(votetype_id==1)
              }
              
            }
            
            new_polygons<-geo_bw_polygon%>%filter(rs%in%new_information$rs)
            ##If the original Klicked Polygon was a Regierungsbezirk we need to exclude the Gemeinden
            if(count_trailing_zeros(cur_rs)==9){
              new_polygons<-new_polygons%>%filter((nchar(de.regionalschluessel)==5)|endsWith(de.regionalschluessel, "0000000"))
            }
            
            
            #Now combine them
            #Combine Polygons and information based on map mode
            new_map_information<-shiny_combine_polygons_information(selected_map_information,selected_map_mode,new_polygons,new_information)
            update_map<-TRUE
            
          }else if(cur_rs==81110000000){#If we have selected Stuttgart we need the Information for the Bezirke in Stuttgart
            #First we need to get the information as it comds from a different source
            selected_map_information <- input$input_map_visual_mode
            selected_election_type <- all_election_types[all_election_types$election_description == input$input_election_type, "election_type"]
            selected_date<-input$input_election_date%>%as.Date(,"%d.%m.%Y")
            selected_party<-input$input_party
            new_information<-shiny_map_information_ps(database,selected_map_information,"Wahlbezirk",selected_election_type,selected_date,selected_party)
            
            #If we have Bundes or Landtagswahlen only select for the requested Votetype
            if(selected_election_type==2||selected_election_type==3){
              if(input$input_vote_type=="Erststimmen"){
                new_information<-new_information%>%filter(votetype_id==0)
              }else{
                new_information<-new_information%>%filter(votetype_id==1)
              }
              
            }
            new_polygons<-geo_stuttgart_polygon%>%filter(date==selected_date)
            #Combine Polygons and information based on map mode
            #Set the mapmode manually to "Wahlbezirk"
            selected_map_mode<-"Wahlbezirk"
            
            new_map_information<-shiny_combine_polygons_information(selected_map_information,selected_map_mode,new_polygons,new_information)
            update_map<-TRUE
            }
         
          
          
        }
        
        if(update_map){
          ##Update the reactive value to reflect what is currently shown on map. 
          #reactive_map_data<<-reactive_map_data%>%filter(id!=click$id)%>%full_join(new_map_information)
          reactive_map_data<<- bind_rows(
            reactive_map_data %>% filter(id != click$id), #filter clicked entry
            new_map_information
          )
          
          # zoom into the clicked polygon,delete current polygon and show new information one layer deeper
          if(selected_map_information=="Wahlbeteiligung"){
            leafletProxy("electionmap") %>%
              removeShape(layerId = click$id)%>%
              fitBounds(
                lng1 = bounds_list$xmin, lat1 = bounds_list$ymin,
                lng2 = bounds_list$xmax, lat2 = bounds_list$ymax
              )%>%
              addPolygons(data = new_map_information,
                          fillColor = ~ifelse(is.na(color), "transparent", color),
                          fillOpacity = ~ifelse(is.na(color), 0, 0.7),
                          color = "blue", 
                          weight = 2, 
                          opacity = 0.7, 
                          highlightOptions = highlightOptions(
                            color = "red", 
                            weight = 3, 
                            bringToFront = TRUE),
                          label = ~ifelse(is.na(label), NA, label),
                          labelOptions = labelOptions(
                            style = list("color" = "black", "font-weight" = "bold"),
                            textsize = "15px",
                            direction = "auto"
                          ),
                          layerId = ~ifelse(is.na(id), NA, id)) %>%
              clearControls() %>%
              addLegend(
                pal = shiny_colorscale_turnout(reactive_map_data$turnout),
                values = reactive_map_data$turnout * 100, 
                title = "Wahlbeteiligung (%)",
                position = "bottomright"
                )
          }else if(selected_map_information=="Hochburg"){
            leafletProxy("electionmap") %>%
              removeShape(layerId = click$id)%>%
              fitBounds(
                lng1 = bounds_list$xmin, lat1 = bounds_list$ymin,
                lng2 = bounds_list$xmax, lat2 = bounds_list$ymax
              )%>% 
              addPolygons(data = new_map_information,
                          fillColor = ~ifelse(is.na(color), "transparent", color),
                          fillOpacity = ~ifelse(is.na(color), 0, 0.7),
                          color = "blue", 
                          weight = 2, 
                          opacity = 0.7, 
                          highlightOptions = highlightOptions(
                            color = "red", 
                            weight = 3, 
                            bringToFront = TRUE),
                          label = ~ifelse(is.na(label), NA, label),
                          labelOptions = labelOptions(
                            style = list("color" = "black", "font-weight" = "bold"),
                            textsize = "15px",
                            direction = "auto"
                          ),
                          layerId = ~ifelse(is.na(id), NA, id)) %>%
              clearControls() %>%
              addLegend(
                pal = shiny_colorscale_party(reactive_map_data$vote_percent,reactive_map_data$orig_color[1]),
                values = reactive_map_data$vote_percent * 100, 
                title = paste0("Ergebnis ",input$input_party),
                position = "bottomright"
                )
          }else{
            leafletProxy("electionmap") %>%
              removeShape(layerId = click$id)%>%
              fitBounds(
                lng1 = bounds_list$xmin, lat1 = bounds_list$ymin,
                lng2 = bounds_list$xmax, lat2 = bounds_list$ymax
              )%>%
              addPolygons(data = new_map_information,
                          fillColor = ~ifelse(is.na(color), "transparent", color),
                          fillOpacity = ~ifelse(is.na(color), 0, 0.7),
                          color = "blue", 
                          weight = 2, 
                          opacity = 0.7, 
                          highlightOptions = highlightOptions(
                            color = "red", 
                            weight = 3, 
                            bringToFront = TRUE),
                          label = ~ifelse(is.na(label), NA, label),
                          labelOptions = labelOptions(
                            style = list("color" = "black", "font-weight" = "bold"),
                            textsize = "15px",
                            direction = "auto"
                          ),
                          layerId = ~ifelse(is.na(id), NA, id))
          }
          
          
        }
        
        
      }
    }
  })
  
  ##Server functions for Data tab
  observeEvent(input$data_start, {
    # When the button is clicked, wrap the code in a call to `withBusyIndicatorServer()`
    withBusyIndicatorServer("data_start", {
      data_election<-avaliable_elections%>%filter(descriptionDE==input$data_election)
      data_cities<-cities%>%filter(name%in%input$data_cities)
      data_get_all_information(database,data_cities,data_election,input$data_meta,input$data_aggregate,input$data_ps,input$data_meta_ps,input$data_person)
      if (input$data_ps) {
        stop("choose another option")
      }
    })
  })
  
}

# Run the application 
shinyApp(ui = ui, server = server)

