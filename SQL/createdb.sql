CREATE TABLE IF NOT EXISTS cities (
  rs bigint PRIMARY KEY,
  ags bigint,
  name TEXT,
  population INT
);

COMMENT ON TABLE cities IS 'List of all municipalities with region code (rs), administrative code (ags), name, and population.';
COMMENT ON COLUMN cities.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN cities.ags IS 'Amtlicher Gemeindeschlüssel (official municipality key).';
COMMENT ON COLUMN cities.name IS 'Name of the municipality.';
COMMENT ON COLUMN cities.population IS 'Population count of the municipality.';

CREATE TABLE IF NOT EXISTS election_type (
  election_type INT PRIMARY KEY,
  election_description TEXT
);

COMMENT ON TABLE election_type IS 'Describes different types of elections.';
COMMENT ON COLUMN election_type.election_type IS 'ID of the election type.';
COMMENT ON COLUMN election_type.election_description IS 'Full description of the election type.';

CREATE TABLE IF NOT EXISTS party (
  party_family_id INT PRIMARY KEY,
  name_short TEXT,
  name_long TEXT,
  color TEXT
);

COMMENT ON TABLE party IS 'Contains metadata about political parties.';
COMMENT ON COLUMN party.party_family_id IS 'ID of the political party.';
COMMENT ON COLUMN party.name_short IS 'Abbreviation of the party.';
COMMENT ON COLUMN party.name_long IS 'Full name of the party.';
COMMENT ON COLUMN party.color IS 'Official color code of the party.';

CREATE TABLE IF NOT EXISTS elections (
  election_id INT,
  election_type INT,
  election_name TEXT,
  rs bigint,
  date DATE,
  result_id TEXT,
  CONSTRAINT rs
    FOREIGN KEY(rs) 
      REFERENCES cities(rs),
  CONSTRAINT election_type
    FOREIGN KEY(election_type) 
      REFERENCES election_type(election_type),
  CONSTRAINT unique_election_rs UNIQUE (election_id, rs)
);

COMMENT ON TABLE elections IS 'Contains metadata about elections held in cities.';
COMMENT ON COLUMN elections.election_id IS 'Unique identifier of the election in that city.';
COMMENT ON COLUMN elections.election_type IS 'Election type ID from election_type table.';
COMMENT ON COLUMN elections.election_name IS 'Name of the election.';
COMMENT ON COLUMN elections.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN elections.date IS 'Date when the election took place.';
COMMENT ON COLUMN elections.result_id IS 'Additional Result ID from Votemanager';

CREATE TABLE IF NOT EXISTS elections_votetypes (
  rs bigint,
  election_id INT,
  votetype_id INT,
  votetype_description TEXT,
  CONSTRAINT election_id
    FOREIGN KEY(election_id,rs) 
      REFERENCES elections(election_id,rs),
  CONSTRAINT unique_election_votetypes UNIQUE (election_id, rs, votetype_id)
);

COMMENT ON TABLE elections_votetypes IS 'Describes different vote types for an election.';
COMMENT ON COLUMN elections_votetypes.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN elections_votetypes.election_id IS 'Election ID from the elections table.';
COMMENT ON COLUMN elections_votetypes.votetype_id IS 'ID of the vote type.';
COMMENT ON COLUMN elections_votetypes.votetype_description IS 'Description of the vote type.';

CREATE TABLE IF NOT EXISTS election_party (
  rs bigint,
  election_id INT,
  party_id INT,
  votetype_id INT,
  ps_id INT,
  name TEXT,
  color TEXT,
  name_long TEXT,
  CONSTRAINT rs
    FOREIGN KEY(rs) 
      REFERENCES cities(rs),
  CONSTRAINT election_id
    FOREIGN KEY(election_id,rs) 
      REFERENCES elections(election_id,rs),
  CONSTRAINT unique_election_party UNIQUE (rs, party_id, election_id, votetype_id)
);

COMMENT ON TABLE election_party IS 'Contains information about Parties that ran in a specific election. For personalized elections (Erststimme) the candidate is the party';
COMMENT ON COLUMN election_party.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN election_party.election_id IS 'Election ID from the elections table.';
COMMENT ON COLUMN election_party.party_id IS 'Party ID inside a election and city it is counted up in order they appeared on the ballot.';
COMMENT ON COLUMN election_party.votetype_id IS 'Vote type ID from elections_votetypes table.';
COMMENT ON COLUMN election_party.ps_id IS 'Polling station ID.';
COMMENT ON COLUMN election_party.name IS 'Name of the party/candidate in the election.';
COMMENT ON COLUMN election_party.color IS 'Color of the party/candidate in the election.';
COMMENT ON COLUMN election_party.name_long IS 'Full name of the party/candidate in the election.';

CREATE TABLE IF NOT EXISTS election_party_family (
  rs bigint,
  party_family_id INT,
  election_id INT,
  ps_id INT,
  party_id INT,
  votetype_id INT,
  CONSTRAINT rs
    FOREIGN KEY(rs) 
      REFERENCES cities(rs),
  CONSTRAINT election_id
    FOREIGN KEY(election_id,rs) 
      REFERENCES elections(election_id,rs),
  CONSTRAINT party_family_id
    FOREIGN KEY(party_family_id) 
      REFERENCES party(party_family_id),
  CONSTRAINT party_id 
    FOREIGN KEY(party_id,election_id,votetype_id,rs) 
      REFERENCES election_party(party_id,election_id,votetype_id,rs),
  CONSTRAINT unique_election_party_family UNIQUE (election_id, rs, party_family_id,party_id,votetype_id)
);

COMMENT ON TABLE election_party_family IS 'Maps parties or candiates to their party families (more or less to their real party) in an election. This is needed as the order of parties can be different between elections (or votetypes) and sometimes a list/candidate is shared between parties.';
COMMENT ON COLUMN election_party_family.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN election_party_family.party_family_id IS 'Political party family ID.';
COMMENT ON COLUMN election_party_family.election_id IS 'Election ID from the elections table.';
COMMENT ON COLUMN election_party_family.ps_id IS 'Polling station ID.';
COMMENT ON COLUMN election_party_family.party_id IS 'Party ID from the election_party table.';
COMMENT ON COLUMN election_party_family.votetype_id IS 'Vote type ID from elections_votetypes table.';

CREATE TABLE IF NOT EXISTS polling_stations (
  ps_id INT,
  name TEXT,
  adress TEXT,
  description TEXT,
  rs bigint,
  date DATE,
  is_postal BOOLEAN,
  election_id INT,
  CONSTRAINT rs
    FOREIGN KEY(rs) 
      REFERENCES cities(rs),
  CONSTRAINT election_id
    FOREIGN KEY(election_id,rs) 
      REFERENCES elections(election_id,rs),
  CONSTRAINT unique_polling_stations UNIQUE (ps_id, rs, election_id)
);

COMMENT ON TABLE polling_stations IS 'Contains information about polling stations in each city and election.';
COMMENT ON COLUMN polling_stations.ps_id IS 'Unique polling station ID.';
COMMENT ON COLUMN polling_stations.name IS 'Name of the polling station.';
COMMENT ON COLUMN polling_stations.adress IS 'Address of the polling station.';
COMMENT ON COLUMN polling_stations.description IS 'Description of the polling station.';
COMMENT ON COLUMN polling_stations.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN polling_stations.date IS 'Date of election.';
COMMENT ON COLUMN polling_stations.is_postal IS 'Indicates if the polling station is postal.';
COMMENT ON COLUMN polling_stations.election_id IS 'Election ID from the elections table.';

CREATE TABLE IF NOT EXISTS election_result (
  rs bigint,
  election_id INT,
  ps_id INT,
  party_id INT,
  votetype_id INT,
  vote_count NUMERIC,
  vote_percent NUMERIC,
  candidate_name TEXT,
  candidate_occupation TEXT,
  candidate_age INT,
  CONSTRAINT rs
    FOREIGN KEY(rs) 
      REFERENCES cities(rs),
  CONSTRAINT election_id
    FOREIGN KEY(election_id,rs) 
      REFERENCES elections(election_id,rs),
  CONSTRAINT ps_id
    FOREIGN KEY(ps_id,election_id,rs) 
      REFERENCES polling_stations(ps_id,election_id,rs),
  CONSTRAINT votetype_id
    FOREIGN KEY(votetype_id,election_id,rs) 
      REFERENCES elections_votetypes(votetype_id,election_id,rs),
  CONSTRAINT unique_election_result UNIQUE (rs, party_id, election_id, ps_id, candidate_name, votetype_id)
);

COMMENT ON TABLE election_result IS 'Contains the detailed election results for each party at each polling station.';
COMMENT ON COLUMN election_result.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN election_result.election_id IS 'Election ID from the elections table.';
COMMENT ON COLUMN election_result.ps_id IS 'Polling station ID from polling_stations table.';
COMMENT ON COLUMN election_result.party_id IS 'Party ID from party table.';
COMMENT ON COLUMN election_result.votetype_id IS 'Vote type ID from elections_votetypes table.';
COMMENT ON COLUMN election_result.vote_count IS 'Number of votes the party received at the polling station.';
COMMENT ON COLUMN election_result.vote_percent IS 'Percentage of total votes the party received.';
COMMENT ON COLUMN election_result.candidate_name IS 'Name of the candidate for the party.';
COMMENT ON COLUMN election_result.candidate_occupation IS '(Currently not in use) Occupation of the candidate.';
COMMENT ON COLUMN election_result.candidate_age IS '(Currently not in use) Age of the candidate.';

CREATE TABLE IF NOT EXISTS election_result_ps (
  rs bigint,
  election_id INT,
  ps_id INT,
  votetype_id INT,
  votes_eligible NUMERIC,
  voters NUMERIC,
  invalid_ballots NUMERIC,
  valid_ballots NUMERIC,
  votes_cast NUMERIC,
  turnout NUMERIC,
  CONSTRAINT rs
    FOREIGN KEY(rs) 
      REFERENCES cities(rs),
  CONSTRAINT election_id
    FOREIGN KEY(election_id,rs) 
      REFERENCES elections(election_id,rs),
  CONSTRAINT ps_id
    FOREIGN KEY(ps_id,election_id,rs) 
      REFERENCES polling_stations(ps_id,election_id,rs),
  CONSTRAINT votetype_id
    FOREIGN KEY(votetype_id,election_id,rs) 
      REFERENCES elections_votetypes(votetype_id,election_id,rs),
  CONSTRAINT unique_election_result_ps UNIQUE (rs, election_id, ps_id, votetype_id)
);

COMMENT ON TABLE election_result_ps IS 'Aggregated election results for each polling station.';
COMMENT ON COLUMN election_result_ps.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN election_result_ps.election_id IS 'Election ID from the elections table.';
COMMENT ON COLUMN election_result_ps.ps_id IS 'Polling station ID from polling_stations table.';
COMMENT ON COLUMN election_result_ps.votetype_id IS 'Vote type ID from elections_votetypes table.';
COMMENT ON COLUMN election_result_ps.votes_eligible IS 'Number of eligible voters at the polling station.';
COMMENT ON COLUMN election_result_ps.voters IS 'Number of voters who participated in the election.';
COMMENT ON COLUMN election_result_ps.invalid_ballots IS 'Number of invalid ballots.';
COMMENT ON COLUMN election_result_ps.valid_ballots IS 'Number of valid ballots.';
COMMENT ON COLUMN election_result_ps.votes_cast IS 'Number of total votes cast. (This can be different than the number of voters if one voters has more than one vote';
COMMENT ON COLUMN election_result_ps.turnout IS 'Voter turnout percentage.';

CREATE TABLE IF NOT EXISTS election_ps_postal_mapping (
  rs bigint,
  election_type INT,
  date DATE,
  ps_id INT,
  ps_id_postal INT,
  CONSTRAINT unique_election_ps_postal_mapping UNIQUE (rs,election_type,date,ps_id),
  CONSTRAINT rs 
    FOREIGN KEY (rs) 
      REFERENCES cities(rs),
  CONSTRAINT election_type 
    FOREIGN KEY (election_type) 
      REFERENCES election_type(election_type)
);

COMMENT ON TABLE election_ps_postal_mapping IS 'Maps polling stations to postal voting records. This is currently only maintained for Stuttgart where there is a 1:1 relationship between postal polling station and normal polling station';
COMMENT ON COLUMN election_ps_postal_mapping.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN election_ps_postal_mapping.election_type IS 'Election type ID from election_type table.';
COMMENT ON COLUMN election_ps_postal_mapping.date IS 'Date of the election.';
COMMENT ON COLUMN election_ps_postal_mapping.ps_id IS 'Normal Polling station ID.';
COMMENT ON COLUMN election_ps_postal_mapping.ps_id_postal IS 'Postal polling station ID.';

CREATE TABLE IF NOT EXISTS election_vote_district_mapping (
  rs bigint,
  election_type INT,
  date DATE,
  ps_id INT,
  district_id INT,
  CONSTRAINT election_type 
    FOREIGN KEY (election_type) 
      REFERENCES election_type(election_type),
  CONSTRAINT unique_election_vote_district_mapping UNIQUE (rs,election_type,date,ps_id)
);

COMMENT ON TABLE election_vote_district_mapping IS 'Maps municipalities to voting districts (Wahlkreise). If one municipality has more than one voting district than the polling stations are maintained as well';
COMMENT ON COLUMN election_vote_district_mapping.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN election_vote_district_mapping.election_type IS 'Election type ID from election_type table.';
COMMENT ON COLUMN election_vote_district_mapping.date IS 'Election date.';
COMMENT ON COLUMN election_vote_district_mapping.ps_id IS 'Polling station ID. (Only maintained if the whole municipality is split in different voting districts)';
COMMENT ON COLUMN election_vote_district_mapping.district_id IS 'Voting district ID. This is the official voting district id.';

CREATE TABLE IF NOT EXISTS election_elected_candidates (
  rs bigint,
  election_type INT,
  date DATE,
  election_id INT,
  party_id INT,
  name TEXT,
  mandate_type TEXT,
  CONSTRAINT unique_election_elected_candidates UNIQUE (rs,election_type,date,election_id,party_id,name);
  CONSTRAINT rs 
    FOREIGN KEY (rs) 
      REFERENCES cities(rs),
  CONSTRAINT election_type 
    FOREIGN KEY (election_type) 
      REFERENCES election_type(election_type)
);

COMMENT ON TABLE election_elected_candidates IS 'Tracks elected candidates for each election.';
COMMENT ON COLUMN election_elected_candidates.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN election_elected_candidates.election_type IS 'Election type ID from election_type table.';
COMMENT ON COLUMN election_elected_candidates.date IS 'Election date.';
COMMENT ON COLUMN election_elected_candidates.election_id IS 'Election ID from elections table.';
COMMENT ON COLUMN election_elected_candidates.party_id IS 'Party ID from party table.';
COMMENT ON COLUMN election_elected_candidates.name IS 'Name of the elected candidate.';
COMMENT ON COLUMN election_elected_candidates.mandate_type IS 'Type of mandate the candidate received. This is currently in use for municipal elections where there is a "Unechteteilortswahl" and some candidates are only elected because their seat is a leveling seat (Ausgleichsmandat). In future it could be used in other elections as well to indicate if a person was voted directly or got a seat from a party list';

CREATE TABLE IF NOT EXISTS election_result_aggregate_party_region (
  rs bigint,
  election_type INT,
  date DATE,
  party_family_id INT,
  color TEXT,
  votetype_id INT,
  vote_count INT,
  vote_percent NUMERIC,
  CONSTRAINT party_family_id
    FOREIGN KEY(party_family_id) 
      REFERENCES party(party_family_id),
  CONSTRAINT election_type 
    FOREIGN KEY (election_type) 
      REFERENCES election_type(election_type),
  CONSTRAINT unique_election_result_aggregate_party_region UNIQUE (party_family_id,rs,election_type,date,votetype_id)
);

COMMENT ON TABLE election_result_aggregate_party_region IS 'Aggregated results for each party across a region (Municipality, District...)';
COMMENT ON COLUMN election_result_aggregate_party_region.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN election_result_aggregate_party_region.election_type IS 'Election type ID from election_type table.';
COMMENT ON COLUMN election_result_aggregate_party_region.date IS 'Election date.';
COMMENT ON COLUMN election_result_aggregate_party_region.party_family_id IS 'Political party family ID.';
COMMENT ON COLUMN election_result_aggregate_party_region.color IS 'Color associated with the party family.';
COMMENT ON COLUMN election_result_aggregate_party_region.votetype_id IS 'Vote type ID from elections_votetypes table.';
COMMENT ON COLUMN election_result_aggregate_party_region.vote_count IS 'Total vote count for the party.';
COMMENT ON COLUMN election_result_aggregate_party_region.vote_percent IS 'Percentage of votes received by the party.';

CREATE TABLE IF NOT EXISTS election_result_aggregate_meta_region (
  rs bigint,
  election_type INT,
  date DATE,
  votetype_id INT,
  votes_eligible NUMERIC,
  voters NUMERIC,
  invalid_ballots NUMERIC,
  valid_ballots NUMERIC,
  votes_cast NUMERIC,
  turnout NUMERIC,
  CONSTRAINT unique_election_result_aggregate_meta_region UNIQUE (rs,election_type,date,votetype_id),
  CONSTRAINT election_type 
    FOREIGN KEY (election_type) 
      REFERENCES election_type(election_type)
);

COMMENT ON TABLE election_result_aggregate_meta_region IS 'Aggregates general election statistics for each region.';
COMMENT ON COLUMN election_result_aggregate_meta_region.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN election_result_aggregate_meta_region.election_type IS 'Election type ID from election_type table.';
COMMENT ON COLUMN election_result_aggregate_meta_region.date IS 'Election date.';
COMMENT ON COLUMN election_result_aggregate_meta_region.votetype_id IS 'Vote type ID from elections_votetypes table.';
COMMENT ON COLUMN election_result_aggregate_meta_region.votes_eligible IS 'Number of eligible voters in the region.';
COMMENT ON COLUMN election_result_aggregate_meta_region.voters IS 'Number of voters who cast ballots in the region.';
COMMENT ON COLUMN election_result_aggregate_meta_region.invalid_ballots IS 'Number of invalid ballots.';
COMMENT ON COLUMN election_result_aggregate_meta_region.valid_ballots IS 'Number of valid ballots.';
COMMENT ON COLUMN election_result_aggregate_meta_region.votes_cast IS 'Number of total votes cast.';
COMMENT ON COLUMN election_result_aggregate_meta_region.turnout IS 'Voter turnout percentage in the region.';

CREATE TABLE IF NOT EXISTS election_result_aggregate_party_ps (
  rs bigint,
  ps_id INT,
  election_type INT,
  date DATE,
  party_family_id INT,
  color TEXT,
  votetype_id INT,
  vote_count INT,
  vote_percent NUMERIC,
  CONSTRAINT party_family_id
    FOREIGN KEY(party_family_id) 
      REFERENCES party(party_family_id),
  CONSTRAINT rs 
    FOREIGN KEY (rs) 
      REFERENCES cities(rs),
  CONSTRAINT election_type 
    FOREIGN KEY (election_type) 
      REFERENCES election_type(election_type),
  CONSTRAINT unique_election_result_aggregate_party_ps UNIQUE (party_family_id,ps_id,rs,election_type,date,votetype_id)
);

COMMENT ON TABLE election_result_aggregate_party_ps IS 'Aggregated results for each party by polling station. This is currently done in Stuttgart as we have a 1:1 relationship between postal and normal polling stations. The relationship is stored in election_ps_postal_mapping';
COMMENT ON COLUMN election_result_aggregate_party_ps.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN election_result_aggregate_party_ps.ps_id IS 'Polling station ID.';
COMMENT ON COLUMN election_result_aggregate_party_ps.election_type IS 'Election type ID from election_type table.';
COMMENT ON COLUMN election_result_aggregate_party_ps.date IS 'Election date.';
COMMENT ON COLUMN election_result_aggregate_party_ps.party_family_id IS 'Political party family ID.';
COMMENT ON COLUMN election_result_aggregate_party_ps.color IS 'Color associated with the party family.';
COMMENT ON COLUMN election_result_aggregate_party_ps.votetype_id IS 'Vote type ID from elections_votetypes table.';
COMMENT ON COLUMN election_result_aggregate_party_ps.vote_count IS 'Total vote count for the party at the polling station.';
COMMENT ON COLUMN election_result_aggregate_party_ps.vote_percent IS 'Percentage of votes received by the party at the polling station.';

CREATE TABLE IF NOT EXISTS election_result_aggregate_meta_ps (
  rs bigint,
  ps_id INT,
  election_type INT,
  date DATE,
  votetype_id INT,
  votes_eligible NUMERIC,
  voters NUMERIC,
  invalid_ballots NUMERIC,
  valid_ballots NUMERIC,
  votes_cast NUMERIC,
  turnout NUMERIC,
  CONSTRAINT unique_election_result_aggregate_meta_ps UNIQUE (rs,ps_id,election_type,date,votetype_id),
  CONSTRAINT rs 
    FOREIGN KEY (rs) 
      REFERENCES cities(rs),
  CONSTRAINT election_type 
    FOREIGN KEY (election_type) 
      REFERENCES election_type(election_type)
);

COMMENT ON TABLE election_result_aggregate_meta_ps IS 'Aggregates general election statistics by polling station. This is currently done in Stuttgart as we have a 1:1 relationship between postal and normal polling stations. The relationship is stored in election_ps_postal_mapping';
COMMENT ON COLUMN election_result_aggregate_meta_ps.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN election_result_aggregate_meta_ps.ps_id IS 'Polling station ID.';
COMMENT ON COLUMN election_result_aggregate_meta_ps.election_type IS 'Election type ID from election_type table.';
COMMENT ON COLUMN election_result_aggregate_meta_ps.date IS 'Election date.';
COMMENT ON COLUMN election_result_aggregate_meta_ps.votetype_id IS 'Vote type ID from elections_votetypes table.';
COMMENT ON COLUMN election_result_aggregate_meta_ps.votes_eligible IS 'Number of eligible voters at the polling station.';
COMMENT ON COLUMN election_result_aggregate_meta_ps.voters IS 'Number of voters who cast ballots at the polling station.';
COMMENT ON COLUMN election_result_aggregate_meta_ps.invalid_ballots IS 'Number of invalid ballots.';
COMMENT ON COLUMN election_result_aggregate_meta_ps.valid_ballots IS 'Number of valid ballots.';
COMMENT ON COLUMN election_result_aggregate_meta_ps.votes_cast IS 'Number of votes cast at the polling station.';
COMMENT ON COLUMN election_result_aggregate_meta_ps.turnout IS 'Voter turnout percentage at the polling station.';

CREATE TABLE IF NOT EXISTS election_result_aggregate_party_district (
  district_id INT,
  election_type INT,
  date DATE,
  party_family_id INT,
  color TEXT,
  votetype_id INT,
  vote_count INT,
  vote_percent NUMERIC,
  CONSTRAINT party_family_id
    FOREIGN KEY(party_family_id) 
      REFERENCES party(party_family_id),
  CONSTRAINT election_type 
    FOREIGN KEY (election_type) 
      REFERENCES election_type(election_type),
  CONSTRAINT unique_election_result_aggregate_party_district UNIQUE (party_family_id,district_id,election_type,date,votetype_id)
);

COMMENT ON TABLE election_result_aggregate_party_district IS 'Aggregated results for each party by district (Wahlkreis).';
COMMENT ON COLUMN election_result_aggregate_party_district.district_id IS 'Voting district ID. This is the official voting district id.';
COMMENT ON COLUMN election_result_aggregate_party_district.election_type IS 'Election type ID from election_type table.';
COMMENT ON COLUMN election_result_aggregate_party_district.date IS 'Election date.';
COMMENT ON COLUMN election_result_aggregate_party_district.party_family_id IS 'Political party family ID.';
COMMENT ON COLUMN election_result_aggregate_party_district.color IS 'Color associated with the party family.';
COMMENT ON COLUMN election_result_aggregate_party_district.votetype_id IS 'Vote type ID from elections_votetypes table.';
COMMENT ON COLUMN election_result_aggregate_party_district.vote_count IS 'Total vote count for the party in the district.';
COMMENT ON COLUMN election_result_aggregate_party_district.vote_percent IS 'Percentage of votes received by the party in the district.';

CREATE TABLE IF NOT EXISTS election_result_aggregate_meta_district (
  district_id INT,
  election_type INT,
  date DATE,
  votetype_id INT,
  votes_eligible NUMERIC,
  voters NUMERIC,
  invalid_ballots NUMERIC,
  valid_ballots NUMERIC,
  votes_cast NUMERIC,
  turnout NUMERIC,
  CONSTRAINT unique_election_result_aggregate_meta_district UNIQUE (election_type,district_id,date,votetype_id)
  CONSTRAINT election_type 
    FOREIGN KEY (election_type) 
      REFERENCES election_type(election_type)
);

COMMENT ON TABLE election_result_aggregate_meta_district IS 'Aggregates general election statistics by district.';
COMMENT ON COLUMN election_result_aggregate_meta_district.district_id IS 'Voting district ID. This is the official voting district id.';
COMMENT ON COLUMN election_result_aggregate_meta_district.election_type IS 'Election type ID from election_type table.';
COMMENT ON COLUMN election_result_aggregate_meta_district.date IS 'Election date.';
COMMENT ON COLUMN election_result_aggregate_meta_district.votetype_id IS 'Vote type ID from elections_votetypes table.';
COMMENT ON COLUMN election_result_aggregate_meta_district.votes_eligible IS 'Number of eligible voters in the district.';
COMMENT ON COLUMN election_result_aggregate_meta_district.voters IS 'Number of voters who cast ballots in the district.';
COMMENT ON COLUMN election_result_aggregate_meta_district.invalid_ballots IS 'Number of invalid ballots in the district.';
COMMENT ON COLUMN election_result_aggregate_meta_district.valid_ballots IS 'Number of valid ballots in the district.';
COMMENT ON COLUMN election_result_aggregate_meta_district.votes_cast IS 'Number of votes cast in the district.';
COMMENT ON COLUMN election_result_aggregate_meta_district.turnout IS 'Voter turnout percentage in the district.';

CREATE TABLE IF NOT EXISTS analysis_name (
  election_type INT,
  date DATE,
  rs bigint,
  ai_model TEXT,
  run INT,
  candidate_name TEXT,
  party_id INT,
  candidate_age INT,
  candidate_gender INT,
  candidate_origin INT,
  CONSTRAINT unique_analysis_name UNIQUE (election_type,date,rs,ai_model,run,candidate_name,party_id),
  CONSTRAINT rs 
    FOREIGN KEY (rs) 
      REFERENCES cities(rs),
  CONSTRAINT election_type 
    FOREIGN KEY (election_type) 
      REFERENCES election_type(election_type)
);

COMMENT ON TABLE analysis_name IS 'Table containing name-based predictions (age, gender, origin) of candidates, including AI model version and run information.';
COMMENT ON COLUMN analysis_name.election_type IS 'Election type ID from election_type table.';
COMMENT ON COLUMN analysis_name.date IS 'Election date.';
COMMENT ON COLUMN analysis_name.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN analysis_name.ai_model IS 'Identifier for the AI model used to generate predictions.';
COMMENT ON COLUMN analysis_name.run IS 'Integer of run. As the names are passed multiple times to one model';
COMMENT ON COLUMN analysis_name.candidate_name IS 'Full name of the candidate.';
COMMENT ON COLUMN analysis_name.party_id IS 'Party ID from party table.';
COMMENT ON COLUMN analysis_name.candidate_age IS 'Predicted or perceived age of the candidate.';
COMMENT ON COLUMN analysis_name.candidate_gender IS 'Predicted or perceived gender of the candidate ( 1=(very likely male);10=(very unlikely male)).';
COMMENT ON COLUMN analysis_name.candidate_origin IS 'Predicted or perceived origin of the candidate ( 1=(very likely of German origin);10=(very unlikely of German origin).';

CREATE TABLE IF NOT EXISTS analysis_variance (
  election_type INT,
  date DATE,
  rs bigint,
  ps_id INT,
  party_id INT,
  standard_deviation NUMERIC,
  cv NUMERIC,
  CONSTRAINT unique_analysis_variance UNIQUE (election_type,date,rs,ps_id,party_id),
  CONSTRAINT rs 
    FOREIGN KEY (rs) 
      REFERENCES cities(rs),
  CONSTRAINT election_type 
    FOREIGN KEY (election_type) 
      REFERENCES election_type(election_type)

);

COMMENT ON TABLE analysis_variance IS 'Table storing measures of variance (e.g., standard deviation, coefficient of variation) for party results in polling stations.';
COMMENT ON COLUMN analysis_variance.election_type IS 'Election type ID from election_type table.';
COMMENT ON COLUMN analysis_variance.date IS 'Election date.';
COMMENT ON COLUMN analysis_variance.rs IS 'Regionalschlüssel (regional key)';
COMMENT ON COLUMN analysis_variance.ps_id IS 'Polling station ID.';
COMMENT ON COLUMN analysis_variance.party_id IS 'Party ID from party table.';
COMMENT ON COLUMN analysis_variance.standard_deviation IS 'Standard deviation of vote count inside one party list between candidates.';
COMMENT ON COLUMN analysis_variance.cv IS 'Coefficient of variation (standard deviation divided by mean) of vote count inside one party list between candidates.'

CREATE INDEX if not exists idx_cities_rs ON cities(rs);
CREATE INDEX if not exists idx_elections_election_id_rs ON elections(election_id, rs, election_type, date);
CREATE INDEX if not exists idx_polling_stations_election_id_rs ON polling_stations(election_id, rs);
CREATE INDEX if not exists idx_election_result ON election_result(election_id, ps_id, rs);
CREATE INDEX if not exists idx_election_result_ps ON election_result_ps(election_id, ps_id, rs);