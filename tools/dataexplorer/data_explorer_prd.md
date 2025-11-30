## **Project Requirements Document: Interactive Record Explorer**

### **1\. Overview and Goal**

This project is an interactive, single-page web visualization designed to explore relationships within a large dataset (sourced from a Google Sheet CSV). The primary goal is to provide a clear, focused, and animated method for users to understand connections between individual records based on shared categorical data (key\_concepts or thematic\_categories), minimizing clutter through constrained animation and interactive state management.

### **2\. Core Features (Functional Requirements)**

| Feature | Description | Status |
| :---- | :---- | :---- |
| **Data Source & Parsing** | Must load and parse data from a specific Google Sheet CSV URL using PapaParse. Only records marked TRUE in the verified column are used for interactive dots. | Complete |
| **Grid Generation** | Grid must contain a fixed maximum of **625 slots** (). Dots are sorted by publication\_date (earliest to most recent) and distributed evenly across the Canvas area (). | Complete |
| **Dynamic Grid Toggle** | Grid display must start at  dots (). A full-width, non-obtrusive bar beneath the Canvas toggles the grid display between  and  dots. The state must persist until the bar is clicked again. | Complete |
| **Dot Styling & Hover** | Each verified dot is colored based on its primary **key concept** or **thematic category** (depending on the user's selection). Dots smoothly expand by  on mouse hover. | Complete |
| **Connection Logic** | The **active connection field** (key\_concepts or thematic\_categories) is determined by a dropdown in the floating header. Connections (paths) and dot colors must match this selected field. | Complete |
| **Connection Limit** | A maximum of  **connection paths** are drawn from the primary record to reduce visual clutter. | Complete |
| **Path Animation** | Connection paths must be animated at variable speeds ( to ) using a three-segment (zig-zag) right-angle (Manhattan) route. All turn points must **snap precisely** to the X or Y coordinates of an existing dot in the grid. | Complete |
| **Interactive States** | Upon clicking a dot, the page enters a locked "exploration mode" where unrelated dots fade out ( opacity), and only the primary and connected dots are clickable. Clicking empty space or the "**Clear the board**" button resets this state. | Complete |
| **Tooltip on Hover** | **Dot Hover:** Displays the publication\_date (small), title (large), and first three tags. **Line Hover:** Displays the connection reason (e.g., "Key concept: \[Concept Name\]"). Tooltip must follow the cursor position. | Complete |
| **Floating Info Panel (Footer)** | The record details must appear in a **full-width, floating horizontal bar** at the bottom of the viewport ( default height). | Complete |
| **Info Panel Controls** | The floating panel must include three "control dots" (Red/Close, Yellow/Minimize to thin bar, Green/Maximize to full modal overlay). | Complete |
| **Primary Data Display** | The info panel header displays the record's **ID**. A blue "**View record source**" button links to the record's **URL**. | Complete |
| **Background Loading & Tutorial Modal** | A full-screen, opaque tutorial modal must appear instantly on page load. Data loading occurs **asynchronously** in the background. The modal only closes after the data is fully loaded AND the user clicks the "Explore the archive" button. | Complete |

### **3\. Key Design and Technical Constraints**

| Constraint | Requirement | Justification / Rationale |
| :---- | :---- | :---- |
| **Fixed Canvas Dimensions** | Canvas internal resolution is fixed to  pixels. The container height is fixed at . | Ensures stable coordinate system for dot placement and animation path calculation, solving scaling/scrolling issues. |
| **Sorting** | The grid dot order must be based on the record's publication\_date (earliest to most recent) to provide inferable information about data flow/history. | User requirement for logical organization. |
| **Coloring Consistency** | The field used for **connection paths** (e.g., key\_concepts) must be the **same field** used to determine the **dot and line colors** for consistency and clarity. | Prevents user confusion (E.g., if a green line (Category A) connected dots based on shared Tag X). |
| **Grid Padding** | The dot grid must use uniform  padding from all four edges of the Canvas to align correctly within the container. | User requirement for proportional aesthetic. |

### **4\. Technical Debt and Lessons Learned (Warnings)**

1. **Parsing Complexity:** Initial attempts at manual CSV parsing failed due to inconsistent data (empty trailing columns, inconsistent tag formatting). **Solution:** Must rely on robust external parser (PapaParse) and conservative filtering (.filter(r \=\> r.isVerified...)).  
2. **Chaotic Connections:** Connecting dots based on the generic tags field (colU) created extreme clutter. **Solution:** Reduced the scope to high-value relational fields (key\_concepts or thematic\_categories) and implemented a strict  **path maximum**.  
3. **Coordinate Hell:** Mixing fixed internal Canvas resolution () with relative CSS container sizes (200\\text{vh}) led to broken dot placement. **Solution:** Switched to a **fixed pixel height () for the container** and guaranteed the Canvas internally matched this height (), providing stable, scrollable coordinates.