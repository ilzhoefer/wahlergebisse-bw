library(httr)
library(jsonlite)
library(htmltools)

openai_key<-
# Requires OPENAI_API_KEY to already be set in the environment before running this script.

llama_post <- function(prompt, model = "mistral", endpoint = "/api/generate") {

  url <- "https://aidaho-edu.uni-hohenheim.de/ollama/queue"
  
  # Prepare Body
  body <- list(
    model = model,
    prompt = prompt,
    endpoint = endpoint
  )
  
  # Make the POST request
  response <- POST(
    url,
    add_headers(`Content-Type` = "application/json"),
    body = toJSON(body, auto_unbox = TRUE)
  )
  
  # Check for errors in the response
  if (status_code(response) != 200) {
    stop("API request failed with status: ", status_code(response))
  }
  
  # Read raw content as text
  raw_content <- content(response, as = "text", encoding = "UTF-8")
  json_chunks <- unlist(strsplit(raw_content, "\n"))
  
  # Reassemble into a valid JSON array
  combined_json <- paste("[", paste(json_chunks, collapse = ","), "]")
  parsed_data <- fromJSON(combined_json)
  
  
  # Decode HTML-encoded text in `response` using htmltools
  if ("response" %in% names(parsed_data)) {
    html_response <- tryCatch({
      # Decode HTML-encoded text
      html_decoded <- HTML(paste(parsed_data$response,collapse = "")) # Convert HTML entities
      as.character(html_decoded) # Extract plain text
    }, error = function(e) {
      warning("Failed to decode HTML-encoded response: ", e$message)
      parsed_data$response # Return raw response if decoding fails
    })
  }
  
  return(list(raw_response=parsed_data,text_response=html_decoded))
}

# Example usage
result <- llama_post(prompt = "Hello LLAMA")
print(result)


prompt <- "A person named Miriam Ilzhöfer is running in a local election. Based only on the name. 
                     How old would you say is this person, what is the gender of the person and is he likly german.
                     The age of the Person can be estimated.
                     Answer only with the exact age you would assume the Person.
                     A number from 0 (Male) to 100(Female) determine the likelihood in gender.
                     And a Number from 0(German) to 100(non German) to determine the likelihood of the Person beeing German

Output Format:
- Age: [number]
- Gender Likelihood: [number from 0 to 100]
- German Likelihood: [number from 0 to 100]"
result <- llama_post(prompt)
print(result)

prompt <- "How old would you guess is a Person named Simone Smith. Answer only with a Number. 
          How likly is it that the name is a Male. Answer only with a number from 1 (very likly male) to 10 (very unlikly male). 
          How Likly is the name to be of german origin. Answer only with a number from 1 (very likly) to 10 (very unlikly)
Answer in a JSON age;male;german. 
"

result <- llama_post(prompt)
print(result)


