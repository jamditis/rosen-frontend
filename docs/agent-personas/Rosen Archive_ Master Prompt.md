# **Master Prompt for Building the Jay Rosen Digital Archive**

**Objective**: To construct the complete, end-to-end Jay Rosen Digital Archive system by directing a team of specialized AI agents.

**To the Project Lead (Human Operator)**: This document is your master plan. Your function is to guide the construction of the project by assigning the tasks outlined below to the appropriate AI specialist agent. Use the persona documents to interact with each agent according to its function.

## **Part 1: Foundational Strategy & Setup**

### **1.1. Execution Model: The Specialized Agent Team**

This project will be built by a team of specialized AI agents, each with a distinct function. As the Project Lead, you will direct the following agents in a logical sequence:

1. **The Architect**: For high-level planning and system design.  
2. **The Backend Engineer**: For building the Python data pipeline.  
3. **The API & Cloud Engineer**: For creating the secure backend API.  
4. **The Frontend Engineer**: For building the React curation dashboard.  
5. **The Code Quality Analyst**: For reviewing and refactoring completed code.  
6. **The Security Analyst**: For auditing components for vulnerabilities.  
7. **The Project Chronicler**: For documenting progress and decisions.  
8. **The Technical Writer**: For creating user and developer documentation.

### **1.2. Initial Consultation with The Architect**

**Objective**: To validate the core architecture.

Instructions for Project Lead:  
Present the architecture from the Rosen Archive: Analysis and Sustainable Architecture Plan document to The Architect agent. Ask it to validate the plan, focusing on sustainability, data flow, and the choice of a Google Cloud Function as the intermediary.

### **1.3. Foundational Setup (Manual Steps)**

**Objective**: To prepare the necessary cloud infrastructure.

Instructions for Project Lead:  
Instruct the user to perform these manual setup steps before any code is generated:

1. **Create a Google Sheet**:  
   * Name: Rosen Archive Database  
   * Worksheet Name: processed\_data  
   * Header Row: id, title, url, author, publication\_date, original\_publication, content\_type, status, summary, gdrive\_pdf\_link, gdrive\_raw\_file\_link, gdrive\_transcript\_link, notes.  
2. **Create Google Drive Folders**:  
   * Main folder: Rosen\_Archive  
   * Subfolders: 01\_Uploaded\_Content, 02\_Processed\_Content.  
3. **Obtain Google Cloud Credentials**:  
   * Guide the user to create a Google Cloud Project, enable the Google Sheets and Google Drive APIs, and create a Service Account.  
   * The user must download the service account's JSON key file as google\_credentials.json.  
4. **Obtain Gemini API Key**:  
   * The user must obtain an API key from Google AI Studio.

## **Part 2: The Backend Data Pipeline**

**Objective**: To create the automated Python pipeline for content processing.

Instructions for Project Lead:  
Assign the following development tasks sequentially to The Backend Engineer. After each component is built, have it reviewed by The Code Quality Analyst.

1. **Task for Backend Engineer**: "Generate a Python script named gdrive\_uploader.py. It must contain functions to authenticate with the Google Drive API using a service account and to upload a specified local file to a specified Google Drive folder, returning the file's shareable link."  
2. **Task for Backend Engineer**: "Generate scraper.py. It requires a function fetch\_article(url) that uses the trafilatura library to extract article text, title, author, and date. It must include robust error handling."  
3. **Task for Backend Engineer**: "Generate categorizer.py. It needs a function summarize\_text(api\_key, text) that uses the Gemini API to generate a one-paragraph summary of the provided text."  
4. **Task for Backend Engineer**: "Generate the main orchestrator script, workflow.py. This script must:  
   * Initialize the gspread client.  
   * Read a list of URLs from urls\_to\_process.txt.  
   * For each new URL, use the other modules (scraper, categorizer, gdrive\_uploader) to process the content.  
   * Generate a unique ID and set the initial status to needs\_review.  
   * Append the final, structured data as a new row to the processed\_data Google Sheet."

## **Part 3: The Secure API Layer**

**Objective**: To create the secure API that allows the frontend to communicate with the Google Sheet.

**Instructions for Project Lead**:

1. Assign the primary development task to the **API & Cloud Engineer**.  
2. Once the code is generated, have it audited by the **Security Analyst**.  
* **Task for API & Cloud Engineer**: "Generate the complete main.py and requirements.txt for a Google Cloud Function. The function must be a Flask app that acts as a secure API for our Google Sheet. Implement all endpoints as defined in the Rosen Archive: Analysis and Sustainable Architecture Plan, including API key authentication and proper CORS handling for every request."  
* **Task for Security Analyst**: "Audit the generated Cloud Function code. Verify that authentication is non-bypassable, credentials are not exposed, and error handling does not leak sensitive information."

## **Part 4: The Frontend Curation Dashboard**

**Objective**: To create the internal web application for managing the archive.

Instructions for Project Lead:  
Assign the following development tasks to the Frontend Engineer.

1. **Task for Frontend Engineer**: "Set up a new React project using Vite and TypeScript. Configure it with Tailwind CSS."  
2. **Task for Frontend Engineer**: "Create the src/types.ts file with an ArchiveItem interface that mirrors our Google Sheet schema."  
3. **Task for Frontend Engineer**: "Create the src/services/googleSheetService.ts file. It must handle all fetch calls to our deployed Google Cloud Function API, including attaching the secret API key to the headers."  
4. **Task for Frontend Engineer**: "Build the main application shell, App.tsx, with a sidebar for navigation between different views."  
5. **Task for Frontend Engineer**: "Build the following React components:  
   * ArchiveExplorer.tsx: Fetches and displays all items. Must include search/filter capabilities and handle loading/error states.  
   * NeedsReview.tsx: Fetches items needing review one by one. Must include 'Approve'/'Reject' buttons that call the API to update the item's status.  
   * AddItemForm.tsx: A form to manually add new items to the archive via an API call."

## **Part 5: Documentation & Project History**

**Objective**: To generate essential documentation and maintain a project history.

Instructions for Project Lead:  
As milestones are completed, assign documentation tasks to the Technical Writer and the Project Chronicler.

* **Task for Technical Writer**: "Generate a comprehensive README.md. It must include the project overview, architecture diagram, and detailed setup instructions for both the backend pipeline and the frontend dashboard."  
* **Task for Project Chronicler**: "A new feature, 'API Key Authentication', was just added to the Cloud Function. Draft a conventional git commit message for this change and update the CHANGELOG.md under the 'Added' section."  
* **Task for Project Chronicler**: "Log the following architectural decision in DECISION\_LOG.md: 'Decided to use a Google Cloud Function instead of Supabase to reduce long-term costs and vendor dependency.'"