# **Changelog: Jay Rosen Digital Archive \- Data Dashboard**

This document tracks the development history, feature additions, and bug fixes for the data dashboard component of the Jay Rosen Digital Archive.

### **Version 2.0: The Enhanced Data Dashboard**

**Date:** October 13, 2025

This version represents a major overhaul of the initial dashboard, transforming it into a more powerful and feature-rich tool for academic research and data exploration.

#### **✨ New features**

* **Expanded data visualizations:**  
  * Added a "Top key concepts" horizontal bar chart to visualize the most frequent topics in the filtered data.  
  * Added a "Yearly activity" bar chart to show the volume of publications per year.  
  * The dashboard now features a responsive 2x2 grid displaying all four charts.  
* **Advanced filtering capabilities:**  
  * Added a "Keyword search" field to filter data based on text content.  
  * Added a "Top publications" checklist filter to narrow down results by specific sources.  
* **Interactive data table:**  
  * Implemented a full-featured data table below the charts to display the raw filtered records.  
  * **Column sorting:** Users can now click on any column header (Date, Title, Publication) to sort the data.  
  * **Pagination:** Added "Previous" and "Next" buttons to navigate through large sets of filtered data.  
  * **Rows per page:** A dropdown selector was added to allow users to display 10, 25, 50, or 100 records per page.  
* **Data export functionality:**  
  * Added an "Export to CSV" button, allowing users to download the currently filtered and sorted data for offline analysis.  
* **Enhanced summary statistics:**  
  * Added a "Most active year" stat card to the summary section.

#### **🎨 Improvements and bug fixes**

* **UI/UX:**  
  * Redesigned the layout into a more robust two-column structure with a persistent controls sidebar.  
  * Improved responsiveness and component styling for a more polished user experience across all devices.  
* **Bug fixes:**  
  * **Treemap coloring:** Fixed a persistent bug where the "Top publications" treemap tiles were not being color-coded correctly. The fix involved rewriting the color-generation logic to work reliably with the Chart.js treemap plugin.  
  * **Syntax errors:** Resolved multiple JavaScript SyntaxError issues that were preventing the application from running. This involved correcting misplaced functions and code snippets.

### **Version 1.0: Initial data dashboard**

**Date:** October 10, 2025

This was the initial version created when the data visualization components were separated from the main "lite" archive into a standalone tool.

#### **✨ Initial features**

* **Core visualizations:**  
  * "Thematic focus over time" stacked line chart.  
  * "Top publications" treemap chart.  
* **Basic filtering:**  
  * Interactive date range slider.  
  * Multi-select checklist for thematic categories.  
* **Summary statistics:**  
  * Included stat cards for "Total records," "Years covered," and "Unique publications."  
* **Architecture:**  
  * Established the single-file, vanilla JavaScript architecture, pulling data from a public Google Sheet.