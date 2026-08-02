library(RPostgres)

# Database connection parameters — set DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS in the environment
# before running this script.
db_host     <- Sys.getenv("DB_HOST")
db_port     <- as.integer(Sys.getenv("DB_PORT"))
db_name     <- Sys.getenv("DB_NAME")
db_user     <- Sys.getenv("DB_USER")
db_password <- Sys.getenv("DB_PASS")

# 1. Establish connection
con <- dbConnect(
  Postgres(),
  host     = db_host,
  port     = db_port,
  dbname   = db_name,
  user     = db_user,
  password = db_password
)

# 2. Check connection (list tables)
tables <- dbListTables(con)
cat("Tables in the database:\n")
print(tables)
