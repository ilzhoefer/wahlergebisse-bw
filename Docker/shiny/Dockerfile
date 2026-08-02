FROM r-base@sha256:c8a0e25cc45f084ae2d9d48aabd6b70bf4d1e0b89417bd21b60af3a6d2fe454e

#RUN apk update
#RUN apk add -v curl-dev libpq

RUN apt-get update && apt-get install -y --no-install-recommends \
   libcurl4-gnutls-dev \
   libssl-dev \
   libxml2-dev\
   libuv1-dev\
    && rm -rf /var/lib/apl/lists/*

RUN install.r pak
RUN R -q -e 'pak::pkg_install(c("leaflet","shiny","shinyjqui","shinydashboard","shinyWidgets","shinydashboardPlus","shinyAce","styler","shinyEffects","DT","plotly","rjson","pool","RPostgres","tidygeocoder","dplyr","tidyr","sf","bit64","data.table","shinythemes","stringr","colorspace","shinyjs"))'
#RUN R -q -e 'pak::pkg_install(c("shinythemes"))'



COPY . /usr/local/src/shiny
WORKDIR /usr/local/src/shiny
EXPOSE 8888
CMD ["R", "-e", "shiny::runApp('.')"]