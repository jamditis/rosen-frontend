# **Product requirements document: Enhanced data dashboard**

Author: Joe Amditis  
Date: October 13, 2025  
Version: 1.0

### **1\. Introduction**

This document outlines the product requirements for the "Enhanced data dashboard," a web-based, interactive tool for the exploration and analysis of the Jay Rosen Internet Archive. The archive contains a curated collection of writings, interviews, and other works by journalism professor Jay Rosen.

This dashboard serves as a powerful research and academic tool, transforming the flat data of the archive into an interactive experience. It allows users to filter, visualize, and analyze trends, topics, and publication patterns within the archive's extensive dataset.

The primary audience for this tool includes students, academic researchers, journalists, and anyone interested in the evolution of media criticism and journalism over the past three decades.

### **2\. Product goals and objectives**

* **Goal 1: Enable deep data exploration.** Provide users with robust tools to filter and dissect the archive's dataset from multiple angles, allowing for nuanced and specific inquiries.  
* **Goal 2: Provide accessible insights through visualization.** Translate complex data into clear, interactive charts and summary statistics that reveal trends and patterns at a glance.  
* **Goal 3: Serve as a functional research tool.** Allow users to not only view the data but also interact with it, sort it, and export filtered results for further academic or research use.  
* **Goal 4: Maintain a user-friendly interface.** Ensure the tool is intuitive and responsive, providing a seamless experience across various devices and screen sizes.

### **3\. Features and functionality**

#### **3.1. Data source and processing**

* **Source:** The dashboard will pull data from a publicly accessible Google Sheet, served as a CSV file.  
  * URL: https://docs.google.com/spreadsheets/d/e/2PACX-1vT-XqQXvMJNaBXVWlmXu1EyOpa\_Cc6ur-pklWX1mbrWIFybZjmbE6UTIteSoCSvf0a7j5r8A6earp3H/pub?gid=928818664\&single=true\&output=csv  
* **Data ingestion:** The application will use PapaParse to fetch and parse the CSV data directly in the browser.  
* **Data cleaning:** Upon ingestion, the data will be cleaned and standardized. This includes normalizing headers, standardizing date formats, cleaning text fields, and parsing tag-based fields (like thematic\_categories) into arrays. Only records marked as verified in the CSV will be used.

#### **3.2. Controls and filters panel**

A persistent sidebar will contain all user-facing controls for manipulating the data.

* **Keyword search:** A text input field that filters the data in real-time based on matches in the title, summary, and key\_concepts fields. The search is debounced to prevent excessive updates while typing.  
* **Date range slider:** An interactive dual-handle slider (noUiSlider) that allows users to filter records by their publication year.  
* **Thematic category filter:** A multi-select checklist of all unique thematic categories found in the dataset. Users can select multiple categories to view records that belong to *any* of the selected categories.  
* **Top publications filter:** A multi-select checklist of the most frequent publication sources.  
* **Reset filters button:** A button to clear all active filters (search, date range, categories, publications) and return the dashboard to its default, unfiltered state.  
* **Export data button:** A button that allows users to export the currently filtered dataset as a CSV file.

#### **3.3. Summary statistics section**

A series of "stat cards" at the top of the main content area will display high-level metrics that update in real-time as filters are applied.

* **Filtered records:** The total count of records matching the current filter criteria.  
* **Years covered:** The earliest and latest publication years within the filtered dataset.  
* **Publications:** The number of unique publication sources in the filtered dataset.  
* **Most active year:** The year with the highest number of published records in the filtered dataset.

#### **3.4. Data visualizations**

The dashboard will feature a 2x2 grid of interactive charts that update in real-time with the filtered data.

* **Thematic focus over time (Line chart):** A stacked line chart showing the publication frequency of the top 5 thematic categories over the selected date range.  
* **Top publications (Treemap chart):** A treemap visualizing the relative volume of articles from different publications. Each publication is color-coded for clarity.  
* **Top key concepts (Horizontal bar chart):** A bar chart displaying the top 10 most frequent "key concepts" in the filtered dataset.  
* **Yearly activity (Bar chart):** A bar chart showing the total number of records published per year over the selected date range.

#### **3.5. Interactive data table**

A detailed table located below the chart grid will display the raw data for the filtered records.

* **Content:** The table will display the publication\_date, title, and original\_publication for each record.  
* **Sorting:** Users can click on any column header to sort the table data by that column in ascending or descending order. An arrow icon will indicate the current sort column and direction.  
* **Pagination:** The table will be paginated to ensure performance and readability. Users can navigate between pages using "Previous" and "Next" buttons.  
* **Rows per page selector:** A dropdown menu will allow users to select how many records to display per page (10, 25, 50, or 100).

### **4\. Technical specifications**

* **Frontend framework:** None. The application will be built with vanilla HTML5, CSS3, and JavaScript (ES6+).  
* **Styling:** Tailwind CSS for utility-first styling, supplemented with a \<style\> block for custom component styles and fonts.  
* **Libraries:**  
  * **Chart.js:** For all data visualizations.  
  * **chartjs-chart-treemap:** A Chart.js plugin for the publications treemap.  
  * **PapaParse:** For in-browser CSV parsing.  
  * **noUiSlider:** For the interactive date range slider.  
* **Architecture:** Single-page application (SPA). All logic is contained within a single index.html file.

### **5\. Design and user experience (UX)**

* **Layout:** The dashboard will use a responsive, two-column layout. The controls sidebar will be on the left, and the main content (stats, charts, table) on the right. On smaller screens, the layout will stack vertically.  
* **Responsiveness:** All components, including charts and the data table, must be fully responsive and functional on devices ranging from mobile phones to large desktop monitors.  
* **Interactivity:** All filters must update the dashboard view instantly. Charts should have tooltips on hover to show detailed data points. The data table should provide clear visual feedback for sorting.

### **6\. Success metrics**

* **Usability:** The tool is considered successful if a new user can understand its core functionality and begin exploring the data within a few minutes without instruction.  
* **Functionality:** All interactive elements (filters, sorting, pagination, export) work reliably and accurately reflect the underlying dataset.  
* **Adoption:** The tool is shared and used by its target audience (students, researchers) for analysis and discovery.

### **7\. Future enhancements (Out of scope for V1)**

* Ability to generate a shareable URL that saves the current filter and view state.  
* Additional chart types and visualization options.  
* A "compare" mode to see two filtered datasets side-by-side.  
* Integration of a more advanced search functionality, potentially using natural language.