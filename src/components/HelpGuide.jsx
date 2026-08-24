import React, { useState } from 'react';
import { authUtils } from '../utils/auth';

function HelpGuide({ onClose }) {
  const [activeSection, setActiveSection] = useState('getting-started');
  const user = authUtils.getUser();
  const isAdmin = user?.role === 'admin';

  const sections = {
    'getting-started': 'Getting Started',
    'dashboard': 'Dashboard',
    'shipping': 'Shipping Schedule',
    'warehouse': 'Warehouse Capacity',
    'stored': 'Stored Stock',
    'workflow': 'Post-Arrival Workflow',
    'receiving': 'Goods Receiving',
    'dock-management': 'Dock Management',
    'suppliers': 'Supplier Management',
    'costing': 'Import Costing',
    'reports': 'Reports & Analytics',
    'liveboard': 'Live Board',
    'alerts': 'Alert Hub',
    'archives': 'Archives',
    'search': 'Global Search',
    'settings': 'User Settings',
    'notifications': 'Notifications',
    ...(isAdmin ? { 'admin': 'Admin Functions' } : {})
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'getting-started':
        return (
          <div>
            <h2>Getting Started</h2>
            <p>Welcome to the Synercore Import Schedule Management System — your central platform for tracking shipments from planning through to warehouse storage.</p>

            <h3>First Time Login</h3>
            <ol>
              <li>Login with your username and temporary password</li>
              <li>Go to <strong>Settings</strong> in the sidebar footer</li>
              <li>Change your password to something secure</li>
              <li>You'll be logged out automatically — login with your new password</li>
            </ol>

            <h3>Navigation</h3>
            <p>The sidebar is organized into collapsible sections:</p>

            <h4>Operations</h4>
            <ul>
              <li><strong>Dashboard</strong> — KPI overview, charts, and quick actions</li>
              <li><strong>Shipping Schedule</strong> — Track all active shipments</li>
              <li><strong>Post-Arrival Workflow</strong> — Manage unloading, inspection, receiving</li>
              <li><strong>Archives</strong> — Access archived shipments</li>
              <li><strong>BOL Audit</strong> — Bill of Lading document auditing</li>
            </ul>

            <h4>Warehouse</h4>
            <ul>
              <li><strong>Goods Receiving</strong> — Receive shipments, confirm quantities, generate GRNs</li>
              <li><strong>Dock Management</strong> — Manage truck arrivals, dock assignments, and queues</li>
              <li><strong>Warehouse Capacity</strong> — Monitor utilization and incoming pallets</li>
              <li><strong>Stored Stock</strong> — View and manage warehouse inventory</li>
            </ul>

            <h4>Planning</h4>
            <ul>
              <li><strong>Suppliers</strong> — Manage supplier database and documents</li>
              <li><strong>Import Costing</strong> — Create and manage cost estimates</li>
            </ul>

            <h4>Analytics</h4>
            <ul>
              <li><strong>Reports</strong> — Standard shipment and warehouse reports</li>
              <li><strong>Advanced Reports</strong> — Custom filters, aggregation, and exports</li>
              <li><strong>Archives</strong> — Access archived shipments</li>
            </ul>

            <h4>Resources</h4>
            <ul>
              <li><strong>Rates & Quotes</strong> — Freight rate lookups</li>
              <li><strong>Supplier Dashboard</strong> — Supplier performance overview</li>
            </ul>

            <h3>Top Bar</h3>
            <ul>
              <li><strong>Global Search</strong> — Search across all shipments by order ref, supplier, vessel, or POD</li>
              <li><strong>Alert Hub</strong> — View and act on system alerts and warnings</li>
            </ul>

            <h3>Clickable Order References</h3>
            <p>Throughout the application, <strong>Order Ref numbers are clickable</strong>. Clicking on an Order Ref opens a detail card showing full shipment information including supplier, product, quantities, status, dates, and more. This works on every page: Shipping Schedule, Stored Stock, Post-Arrival Workflow, Dashboard, Reports, Archives, Live Board, and Supplier Management.</p>
          </div>
        );

      case 'dashboard':
        return (
          <div>
            <h2>Dashboard</h2>

            <h3>Overview</h3>
            <p>The Dashboard provides a real-time overview of your supply chain with KPI tiles, charts, and quick navigation.</p>

            <h3>KPI Tiles</h3>
            <p>The top row shows key metrics, each clickable to navigate to the Shipping Schedule filtered by that status:</p>
            <ul>
              <li><strong>Total Shipments</strong> — All active shipments</li>
              <li><strong>In Transit</strong> — Shipments currently being transported</li>
              <li><strong>Arrived</strong> — Shipments at destination</li>
              <li><strong>Delayed</strong> — Overdue shipments, with sub-types: Port, Customs, Documents, Supplier</li>
              <li><strong>Planned</strong> — Shipments in planning stage</li>
            </ul>
            <p>Each tile shows a week-over-week delta indicator (up/down arrow) comparing to the previous week.</p>

            <h3>Charts</h3>
            <ul>
              <li><strong>Weekly Trend</strong> — Orders per week line chart</li>
              <li><strong>Status Distribution</strong> — Donut chart showing breakdown by status with percentages</li>
              <li><strong>By Warehouse</strong> — Horizontal bar chart showing shipments per warehouse</li>
              <li><strong>Top Suppliers</strong> — Top 5 suppliers ranked by volume with progress bars</li>
              <li><strong>Products & Pallets by Week</strong> — Dual-line chart for weekly trends</li>
            </ul>

            <h3>Offsite Storage Duration</h3>
            <p>Monitors items in offsite storage with color-coded alerts:</p>
            <ul>
              <li><strong style={{color: '#4caf50'}}>Green</strong> — Less than 14 days</li>
              <li><strong style={{color: '#ff9800'}}>Orange</strong> — 15–30 days</li>
              <li><strong style={{color: '#f44336'}}>Red</strong> — Over 30 days (action needed)</li>
            </ul>

            <h3>Upcoming Orders</h3>
            <p>Shows the next 5 upcoming shipments sorted by week. Click the Order Ref to view full details.</p>

            <h3>Quick Action Buttons</h3>
            <p>Navigate directly to Shipping Schedule, Reports, Warehouse Capacity, or the Live Board.</p>
          </div>
        );

      case 'shipping':
        return (
          <div>
            <h2>Shipping Schedule</h2>

            <h3>Overview</h3>
            <p>The Shipping Schedule is your central hub for tracking all active shipments from planning to arrival. Shipments that have entered the post-arrival workflow (arrived, unloading, inspection, receiving, stored) are excluded — they appear in the Post-Arrival Workflow and Stored Stock views instead.</p>

            <h3>Shipment Status Flow</h3>
            <ol>
              <li><strong>Planned</strong> — Airfreight or Seafreight shipments in planning</li>
              <li><strong>In Transit</strong> — Currently being transported (Airfreight, Roadway, Seaway, Last Mile)</li>
              <li><strong>Air Customs Clearance</strong> — Airfreight clearing customs</li>
              <li><strong>Moored / Berth Working / Berth Complete</strong> — At port stages</li>
              <li><strong>Arrived</strong> — Reached destination (PTA, KLM, or Offsite)</li>
              <li><strong>Delayed</strong> — Overdue shipments, with sub-types: Port, Customs, Documents, Supplier</li>
            </ol>

            <h3>Adding Shipments</h3>
            <ul>
              <li><strong>Manual Entry</strong> — Click "Add Shipment" and fill in the form</li>
              <li><strong>Excel Upload</strong> — Click "Upload Excel" to bulk import shipments from a spreadsheet</li>
            </ul>

            <h3>Editing Shipments</h3>
            <ul>
              <li>Click on any shipment row to expand and edit</li>
              <li>Changes are saved when you update</li>
              <li>Status updates trigger workflow transitions</li>
            </ul>

            <h3>Progress Column</h3>
            <p>Each shipment shows a visual progress bar indicating how far along the shipment lifecycle it is.</p>

            <h3>Clickable Order Ref</h3>
            <p>Click any Order Ref to open a detail card showing all shipment information.</p>

            <h3>Key Fields</h3>
            <ul>
              <li><strong>Order Ref</strong> — Your internal order reference</li>
              <li><strong>Supplier</strong> — Supplier name</li>
              <li><strong>Product Name</strong> — What's being shipped</li>
              <li><strong>Quantity</strong> — Amount (tonnage)</li>
              <li><strong>CBM / Pallet Qty</strong> — Volume or pallet count</li>
              <li><strong>Week Number</strong> — Expected arrival week</li>
              <li><strong>Final POD</strong> — Destination point of delivery</li>
              <li><strong>Freight Type</strong> — Air, Sea, or Road</li>
              <li><strong>Status</strong> — Current shipment status</li>
            </ul>

            <h3>Tips</h3>
            <ul>
              <li>Use status filter chips to focus on specific statuses</li>
              <li>Sort columns by clicking on headers</li>
              <li>Use Global Search at the top to find specific shipments</li>
              <li>Export data using the Reports section</li>
            </ul>
          </div>
        );

      case 'warehouse':
        return (
          <div>
            <h2>Warehouse Capacity Management</h2>

            <h3>Overview</h3>
            <p>Monitor and manage warehouse utilization to prevent overcapacity and optimize storage across Pretoria, Klapmuts, and Offsite warehouses.</p>

            <h3>Capacity Cards</h3>
            <p>Each warehouse card shows:</p>
            <ul>
              <li><strong>Bin Utilization %</strong> — Visual progress bar showing fullness</li>
              <li><strong>Current Bins Utilized</strong> — Bins currently in use (editable)</li>
              <li><strong>Incoming</strong> — Pallets arriving this month</li>
              <li><strong>Total Bins</strong> — Maximum warehouse capacity</li>
              <li><strong>Available Bins</strong> — Remaining capacity</li>
            </ul>

            <h3>Status Indicators</h3>
            <ul>
              <li><strong style={{color: '#f44336'}}>Over Capacity</strong> — 95%+ full (Red)</li>
              <li><strong style={{color: '#ff9800'}}>Near Capacity</strong> — 80–95% full (Orange)</li>
              <li><strong style={{color: '#4caf50'}}>Good Utilization</strong> — 60–80% full (Green)</li>
              <li><strong style={{color: '#2196f3'}}>Under Utilized</strong> — Below 60% full (Blue)</li>
            </ul>

            <h3>Updating Current Bins</h3>
            <ol>
              <li>Scroll to the <strong>Edit Current Bins Utilized</strong> panel</li>
              <li>Enter the actual number of bins currently in use for each warehouse</li>
              <li>Fields with pending changes show an orange highlight</li>
              <li>Click <strong>"Save All Changes"</strong> to save</li>
              <li>Changes are tracked with your username for audit trail</li>
            </ol>

            <h3>Weekly Capacity Inflow</h3>
            <p>The table shows incoming pallets by week for the current month, helping you plan capacity needs.</p>

            <h3>Incoming Products by ETA Week</h3>
            <p>Shows products that are currently <strong>in transit only</strong> (planned, in-transit, at port, or delayed). Arrived, stored, and archived shipments are excluded. Click a product name to view the full shipment detail card.</p>

            <h3>Export Reports</h3>
            <p>Click "Export Warehouse Capacity PDF" to generate a detailed report with capacity status, weekly inflow, and product summaries.</p>
          </div>
        );

      case 'stored':
        return (
          <div>
            <h2>Stored Stock</h2>

            <h3>Overview</h3>
            <p>View and manage all shipments that have completed the post-arrival workflow and are currently stored in warehouses.</p>

            <h3>Search & Filters</h3>
            <ul>
              <li><strong>Text Search</strong> — Filter by Order Ref, Supplier, Product, or Warehouse</li>
              <li><strong>Week Filter</strong> — Multi-select dropdown to filter by arrival week</li>
            </ul>

            <h3>Grouped by Warehouse</h3>
            <p>Shipments are grouped into collapsible sections by warehouse (Pretoria, Klapmuts, Offsite, Unassigned). Each group shows pallet totals and active vs archived counts. Click the warehouse header to collapse/expand.</p>

            <h3>Table Columns</h3>
            <ul>
              <li><strong>Order Ref</strong> — Clickable to view full shipment details</li>
              <li><strong>Supplier</strong> — Supplier name</li>
              <li><strong>Product</strong> — Product name</li>
              <li><strong>Qty</strong> — Quantity (tonnage)</li>
              <li><strong>Pallets</strong> — Pallet count</li>
              <li><strong>Stored Date</strong> — When it was stored (click to edit inline)</li>
              <li><strong>Days</strong> — Days in storage (shown for all warehouses)</li>
              <li><strong>Actions</strong> — Edit, Move, Archive</li>
            </ul>

            <h3>Actions</h3>
            <ul>
              <li><strong>Edit</strong> — Opens a modal to edit shipment details (Order Ref, Supplier, Product, Quantity, Pallets, CBM, Week, Warehouse, Final POD, Freight Type, Stored Date)</li>
              <li><strong>Move</strong> — Move a shipment to a different warehouse (Pretoria, Klapmuts, Offsite)</li>
              <li><strong>Archive</strong> — Archive a shipment to remove it from active stock</li>
              <li><strong>Archive All</strong> — Archive all active stored shipments at once</li>
            </ul>

            <h3>Stored Date</h3>
            <p>The stored date is editable inline — click on it to change using a date picker.</p>

            <h3>Archived Items</h3>
            <p>Archived shipments are displayed with an "ARCHIVED" badge and can still be viewed in the table.</p>
          </div>
        );

      case 'workflow':
        return (
          <div>
            <h2>Post-Arrival Workflow</h2>

            <h3>Overview</h3>
            <p>Manage the complete post-arrival process from unloading through to storage. Shipments appear here once they reach "Arrived" status.</p>

            <h3>Workflow Modes</h3>
            <p>You can process shipments using either:</p>
            <ul>
              <li><strong>Step-by-Step Wizard</strong> — Guided workflow that walks you through each stage</li>
              <li><strong>Quick Actions</strong> — Direct action buttons on each shipment card</li>
            </ul>

            <h3>Workflow Stages</h3>

            <h4>1. Unloading</h4>
            <ul>
              <li>Click "Start Unloading" when the shipment arrives</li>
              <li>Records start time automatically</li>
              <li>Click "Complete Unloading" when done</li>
              <li>Automatically moves to Inspection stage</li>
            </ul>

            <h4>2. Inspection</h4>
            <ul>
              <li>Click "Start Inspection"</li>
              <li>Inspect quality and quantity</li>
              <li>Add inspection notes and inspector name</li>
              <li>Mark as <strong>Passed</strong>, <strong>Failed</strong>, or <strong>On Hold</strong></li>
              <li>Failed inspections can be re-inspected or rejected</li>
            </ul>

            <h4>3. Receiving</h4>
            <ul>
              <li>Click "Start Receiving"</li>
              <li>Enter actual received quantity</li>
              <li>Note any discrepancies</li>
              <li>Record receiver name</li>
              <li>Click "Complete Receiving"</li>
            </ul>

            <h4>4. Storage</h4>
            <ul>
              <li>Click "Mark as Stored"</li>
              <li>Shipment moves to Stored Stock view</li>
            </ul>

            <h3>Rejection Workflow</h3>
            <p>If inspection fails and the shipment cannot be accepted:</p>
            <ol>
              <li>Click "Reject / Return to Supplier"</li>
              <li>Enter rejection reason and your name</li>
              <li>Optionally auto-archive the shipment</li>
              <li>Submit the rejection</li>
            </ol>

            <h3>Amend Status</h3>
            <p>Use "Amend Status" to revert a shipment back to In Transit in the Shipping Schedule if it was moved to post-arrival by mistake.</p>

            {isAdmin && (
              <>
                <h3>Admin: Skip to Stored</h3>
                <p>Admins see a <strong>"Skip to Stored"</strong> button on each shipment card. This instantly completes the entire workflow — unloading, inspection (passed), and receiving — and marks the shipment as stored. A confirmation dialog appears before proceeding. Useful when a shipment doesn't need the full manual workflow.</p>
              </>
            )}

            <h3>Tips</h3>
            <ul>
              <li>All timestamps are recorded automatically</li>
              <li>Click the Order Ref to view full shipment details</li>
              <li>Shipment cards show a progress bar indicating workflow completion</li>
              <li>Status updates are visible to all users in real time</li>
            </ul>
          </div>
        );

      case 'receiving':
        return (
          <div>
            <h2>Goods Receiving</h2>

            <h3>Overview</h3>
            <p>The Goods Receiving page is a dedicated view for warehouse staff to receive incoming shipments, confirm quantities, log discrepancies, and generate Goods Received Notes (GRNs). Unlike the Post-Arrival Workflow (which covers the full pipeline), this page focuses specifically on the receiving step.</p>

            <h3>Summary Cards</h3>
            <p>Four cards at the top provide a quick snapshot:</p>
            <ul>
              <li><strong>Pending Receiving</strong> — Shipments that have passed inspection and are waiting to be received</li>
              <li><strong>Active Receiving</strong> — Shipments currently being received</li>
              <li><strong>Received Today</strong> — Count of shipments received today</li>
              <li><strong>Discrepancies</strong> — Number of shipments received today with noted discrepancies</li>
            </ul>

            <h3>Tabs</h3>

            <h4>Receiving Queue</h4>
            <p>Shows shipments that have passed inspection and are ready to be received. Click <strong>"Receive"</strong> on a shipment to open the receiving form.</p>

            <h4>Active</h4>
            <p>Shows shipments currently in the receiving process. Click <strong>"Complete"</strong> to finalize receiving.</p>

            <h4>Recent History</h4>
            <p>Shows shipments received in the last 7 days. From here you can:</p>
            <ul>
              <li><strong>Generate GRN</strong> — Create a Goods Received Note number for the shipment</li>
              <li><strong>Download GRN</strong> — Download a PDF of the GRN (once generated)</li>
            </ul>

            <h3>Receiving Form</h3>
            <p>When you click "Receive" or "Complete", a form opens with the following fields:</p>
            <ul>
              <li><strong>Received Quantity</strong> — Pre-filled with the expected quantity; adjust if different</li>
              <li><strong>Bin Location</strong> — The warehouse bin/rack where the goods will be stored (e.g. A-12-3)</li>
              <li><strong>Discrepancies</strong> — Note any damage, shortages, or quality issues</li>
              <li><strong>Notes</strong> — Any additional notes about the receiving</li>
              <li><strong>Received By</strong> — Pre-filled with your username</li>
            </ul>

            <h3>GRN (Goods Received Note)</h3>
            <p>A GRN is a formal receipt confirming goods have been received. The generated PDF includes:</p>
            <ul>
              <li>GRN number (format: GRN-YYYYMMDD-NNN)</li>
              <li>Date, order ref, supplier, product, and quantities</li>
              <li>Warehouse and bin location</li>
              <li>Discrepancies and notes (if any)</li>
              <li>Signature lines for Received By and Authorized By</li>
            </ul>

            <h3>Search</h3>
            <p>Use the search box to filter shipments across all tabs by order ref, supplier, product, or warehouse.</p>

            <h3>Tips</h3>
            <ul>
              <li>Always check quantities against the delivery note before confirming</li>
              <li>Record discrepancies immediately — they are saved with the shipment record</li>
              <li>Generate and file GRNs for audit compliance</li>
              <li>The receiving queue automatically updates when inspections are completed in the Post-Arrival Workflow</li>
            </ul>
          </div>
        );

      case 'dock-management':
        return (
          <div>
            <h2>Dock Management</h2>

            <h3>Overview</h3>
            <p>The Dock Management page handles truck arrivals at warehouse loading docks. Schedule incoming trucks, assign them to docks, track unloading progress, and manage queues when all docks are occupied.</p>

            <h3>Warehouse Filter</h3>
            <p>Use the dropdown at the top to filter by warehouse (Pretoria, Klapmuts, Offsite, or All). All data — docks, schedule, queue, and metrics — updates based on your selection.</p>

            <h3>Metrics Cards</h3>
            <ul>
              <li><strong>Trucks Today</strong> — Total truck arrivals scheduled or processed today</li>
              <li><strong>Avg Wait</strong> — Average time trucks wait from check-in to dock assignment</li>
              <li><strong>Avg Turnaround</strong> — Average total time from check-in to check-out</li>
              <li><strong>Dock Utilization</strong> — Percentage of docks currently occupied</li>
            </ul>

            <h3>Tabs</h3>

            <h4>Schedule</h4>
            <p>Shows today's truck arrivals in a table with expected time, carrier, driver, vehicle registration, linked shipment, assigned dock, status, and wait time. Actions available depend on the truck's current status.</p>

            <h4>Dock Board</h4>
            <p>A visual card grid showing the real-time status of every dock:</p>
            <ul>
              <li><strong style={{color: '#10b981'}}>Green</strong> — Available and ready for assignment</li>
              <li><strong style={{color: '#f59e0b'}}>Orange</strong> — Occupied with a truck currently unloading</li>
              <li><strong style={{color: '#ef4444'}}>Red</strong> — Under maintenance (not available)</li>
            </ul>
            <p>Occupied docks show the current truck's carrier, vehicle, driver, and linked shipment. You can click <strong>"Complete Unloading"</strong> directly from the dock card.</p>
            <p>The dock board auto-refreshes every 30 seconds.</p>

            <h4>Queue</h4>
            <p>When all docks are occupied, checked-in trucks are placed in a FIFO (first-in, first-out) queue. The queue shows position, carrier, driver, vehicle, check-in time, and how long the truck has been waiting. Click <strong>"Assign Dock"</strong> when a dock becomes available.</p>

            <h3>Truck Lifecycle</h3>
            <p>Each truck goes through these stages:</p>
            <ol>
              <li><strong>Scheduled</strong> — Truck arrival has been registered with expected time and details</li>
              <li><strong>Check In</strong> — Driver arrives. If a dock is available, the truck is assigned immediately. Otherwise it joins the queue</li>
              <li><strong>Unloading</strong> — Truck is at a dock and goods are being unloaded</li>
              <li><strong>Completed</strong> — Unloading finished. The dock is freed automatically and the next queued truck (if any) is auto-assigned</li>
              <li><strong>Departed</strong> — Truck has left the premises</li>
            </ol>

            <h3>Scheduling a Truck</h3>
            <ol>
              <li>Click <strong>"+ Add Truck"</strong> at the top</li>
              <li>Fill in: Carrier, Driver Name, Driver Phone, Vehicle Registration, Expected Arrival time, and any notes</li>
              <li>Click <strong>"Schedule Arrival"</strong></li>
            </ol>

            <h3>Assigning a Dock</h3>
            <p>When you click "Assign Dock" on a queued truck, a modal shows all available docks with their warehouse. Click a dock to assign the truck immediately. If no docks are available, the truck remains in the queue.</p>

            <h3>Auto-Assignment</h3>
            <p>When a truck completes unloading and frees its dock, the system automatically checks the queue and assigns the next waiting truck to the freed dock. You'll see a confirmation message when this happens.</p>

            <h3>Default Docks</h3>
            <p>The system comes pre-configured with:</p>
            <ul>
              <li><strong>Pretoria</strong> — Docks 1–4</li>
              <li><strong>Klapmuts</strong> — Docks 1–2</li>
              <li><strong>Offsite</strong> — Dock 1</li>
            </ul>

            <h3>Tips</h3>
            <ul>
              <li>Schedule truck arrivals in advance so warehouse staff can plan dock availability</li>
              <li>Monitor the queue tab during busy periods to avoid excessive wait times</li>
              <li>Use the dock board on a wall-mounted screen for real-time visibility</li>
              <li>Check metrics regularly to identify turnaround bottlenecks</li>
              <li>Admins can set docks to "maintenance" status when they need repairs</li>
            </ul>
          </div>
        );

      case 'suppliers':
        return (
          <div>
            <h2>Supplier Management</h2>

            <h3>Overview</h3>
            <p>Manage your supplier database with contact information, documentation, and shipment history.</p>

            <h3>Adding Suppliers</h3>
            <ol>
              <li>Click "Add New Supplier"</li>
              <li>Fill in: Company Name (required), Contact Person, Email, Phone, Address, Country, Notes</li>
              <li>Click "Add Supplier"</li>
            </ol>

            <h3>Editing Suppliers</h3>
            <ul>
              <li>Click "Edit" on any supplier</li>
              <li>Update the information</li>
              <li>Click "Update Supplier"</li>
            </ul>

            <h3>Document Management</h3>
            <p>Upload supplier documents (certificates, agreements, etc.):</p>
            <ol>
              <li>Click "Documents" on the supplier row</li>
              <li>Drag & drop files or click to browse</li>
              <li>Supports PDF, Word, Excel, and image files</li>
              <li>View or download documents anytime</li>
            </ol>

            <h3>Supplier Shipments</h3>
            <p>View shipments linked to each supplier. Order Refs are clickable to view full shipment details.</p>

            <h3>Searching</h3>
            <p>Use the search box to filter suppliers by name in real time.</p>
          </div>
        );

      case 'costing':
        return (
          <div>
            <h2>Import Costing</h2>

            <h3>Overview</h3>
            <p>Create and manage detailed cost estimates for import shipments, including all duty, freight, and local charges.</p>

            <h3>Creating a Cost Estimate</h3>
            <ol>
              <li>Click "New Estimate"</li>
              <li>Fill in header details: Reference, Supplier, Container Type, Incoterms, Payment Terms</li>
              <li>Add product lines with HS Code, Weight, Duty Rate, Invoice Value</li>
              <li>Enter cost breakdowns: Ocean Freight, Origin Charges, Local Cartage, Customs, Duties</li>
              <li>Save as Draft or Finalize</li>
            </ol>

            <h3>Rate of Exchange (ROE)</h3>
            <p>Each estimate includes ROE fields for USD/ZAR and EUR/ZAR conversion:</p>
            <ul>
              <li>Enter rates manually or use the auto-fetch button for current rates</li>
              <li>Set the ROE date for the rate being used</li>
              <li>ROE is displayed prominently in PDF exports</li>
              <li>Foreign currency costs are converted to ZAR using the specified ROE</li>
            </ul>

            <h3>Calculations</h3>
            <ul>
              <li>Cost per kg breakdowns</li>
              <li>Duty calculations based on HS codes</li>
              <li>Total landed cost summary</li>
            </ul>

            <h3>PDF Generation</h3>
            <ul>
              <li><strong>Single Estimate PDF</strong> — Detailed costing sheet with all calculations and ROE</li>
              <li><strong>Batch Report PDF</strong> — Multiple estimates per supplier, each showing ROE info</li>
              <li><strong>Email Estimates</strong> — Send PDF as email attachment</li>
            </ul>

            <h3>Costing Requests</h3>
            <p>Non-admin users can submit costing requests. Admins review and create formal estimates from these requests.</p>

            <h3>Filtering</h3>
            <p>Filter estimates by supplier and product for focused analysis.</p>
          </div>
        );

      case 'reports':
        return (
          <div>
            <h2>Reports & Analytics</h2>

            <h3>Standard Reports</h3>

            <h4>Shipment Reports</h4>
            <ul>
              <li><strong>All Shipments</strong> — Complete shipment list</li>
              <li><strong>By Status</strong> — Filter by shipment status</li>
              <li><strong>By Supplier</strong> — Group shipments by supplier</li>
              <li><strong>By Week</strong> — Shipments arriving each week</li>
              <li><strong>Delayed Shipments</strong> — Overdue arrivals</li>
            </ul>

            <h4>Warehouse Reports</h4>
            <ul>
              <li><strong>Capacity Report</strong> — Current utilization for all warehouses</li>
              <li><strong>Incoming Analysis</strong> — Forecast arrivals by week</li>
              <li><strong>Storage Report</strong> — Currently stored inventory</li>
            </ul>

            <h4>Export Formats</h4>
            <ul>
              <li><strong>PDF</strong> — Formatted, printable reports</li>
              <li><strong>Excel</strong> — Editable spreadsheets with multiple sheets</li>
              <li><strong>CSV</strong> — Raw data for analysis</li>
            </ul>

            <h3>Advanced Reports</h3>
            <p>For more powerful analysis, use the <strong>Advanced Reports</strong> module.</p>

            <h4>Custom Filters</h4>
            <p>Apply multiple filters simultaneously:</p>
            <ul>
              <li><strong>Date Range</strong> — Filter by created, updated, ETA, or ETD date</li>
              <li><strong>Status</strong> — Select multiple statuses</li>
              <li><strong>Warehouse</strong> — Filter by destination</li>
              <li><strong>Supplier</strong> — Select one or more suppliers</li>
              <li><strong>Product</strong> — Filter by product type</li>
              <li><strong>Week Number</strong> — Filter by arrival week</li>
              <li><strong>Forwarding Agent</strong> — Filter by shipping agent</li>
              <li><strong>Incoterms / Vessel / Priority</strong> — Additional filters</li>
              <li><strong>Inspection & Receiving Status</strong> — Post-arrival filters</li>
              <li><strong>Quantity & Pallet Range</strong> — Min/max filters</li>
              <li><strong>Search Term</strong> — Free text search across multiple fields</li>
            </ul>

            <h4>Data Aggregation</h4>
            <p>Group and aggregate data by Supplier, Warehouse, Status, Product, Week, Month, or Forwarding Agent. Each group shows count, total quantity, total pallets, and average quantity.</p>

            <h4>Export Options</h4>
            <ul>
              <li><strong>Export Excel</strong> — Multi-sheet workbook with summary and detail data</li>
              <li><strong>Export PDF</strong> — Formatted report for printing and sharing</li>
            </ul>

            <h3>Clickable Order Refs</h3>
            <p>Click any Order Ref in report tables to view the full shipment detail card.</p>
          </div>
        );

      case 'liveboard':
        return (
          <div>
            <h2>Live Board</h2>

            <h3>Overview</h3>
            <p>A full-screen, dark-themed dashboard designed for wall-mounted displays or quick operational overview. Access it from the Dashboard quick actions or sidebar.</p>

            <h3>Features</h3>
            <ul>
              <li><strong>Live Clock</strong> — Real-time clock with full date display</li>
              <li><strong>Auto-Refresh</strong> — Data refreshes every 30 seconds (green pulse indicator)</li>
              <li><strong>KPI Tiles</strong> — Total, In Transit, At Port, Arrived, Delayed, Planned — large, color-coded numbers</li>
              <li><strong>Status Distribution</strong> — Donut chart showing the breakdown of shipment statuses</li>
              <li><strong>Recent Activity</strong> — The 6 most recently updated shipments with status and timestamp</li>
            </ul>

            <h3>Shipment Details</h3>
            <p>Click on any Order Ref in the Recent Activity section to open a detailed shipment card (dark-themed to match the board).</p>

            <h3>Controls</h3>
            <ul>
              <li>Press <strong>Escape</strong> or click "Exit" to close the Live Board</li>
            </ul>
          </div>
        );

      case 'alerts':
        return (
          <div>
            <h2>Alert Hub</h2>

            <h3>Overview</h3>
            <p>The Alert Hub is a slide-out panel accessible from the bell icon in the top bar. It shows system notifications and warnings about your shipments.</p>

            <h3>Severity Levels</h3>
            <ul>
              <li><strong style={{color: '#ef4444'}}>Critical</strong> — Urgent issues requiring immediate attention</li>
              <li><strong style={{color: '#eab308'}}>Warning</strong> — Potential problems to be aware of</li>
              <li><strong style={{color: '#0ea5e9'}}>Info</strong> — General updates and notifications</li>
            </ul>
            <p>Alerts are sorted by severity (critical first) then by timestamp (newest first).</p>

            <h3>Filtering</h3>
            <ul>
              <li><strong>Search</strong> — Filter alerts by title or description text</li>
              <li><strong>Severity Filter</strong> — Show only Critical, Warning, or Info alerts</li>
              <li><strong>Unread Only</strong> — Toggle to show only unread alerts</li>
            </ul>

            <h3>Alert Details</h3>
            <p>Each alert card shows metadata when available: Order Ref, Supplier, Product, Week, Status, and POD.</p>

            <h3>Smart Navigation</h3>
            <p>Click on an alert card or its "View" button to navigate directly to the shipment in its current location:</p>
            <ul>
              <li>In-transit/planned/delayed shipments open in <strong>Shipping Schedule</strong></li>
              <li>Arrived/unloading/inspection/receiving shipments open in <strong>Post-Arrival Workflow</strong></li>
              <li>Stored shipments open in <strong>Stored Stock</strong></li>
              <li>Archived shipments open in <strong>Archives</strong></li>
            </ul>
            <p>The search is pre-filled with the Order Ref so you can find the shipment immediately.</p>

            <h3>Actions</h3>
            <ul>
              <li><strong>Mark Read</strong> — Mark an alert as read</li>
              <li><strong>Dismiss</strong> — Remove an alert permanently</li>
            </ul>
          </div>
        );

      case 'archives':
        return (
          <div>
            <h2>Archives</h2>

            <h3>Overview</h3>
            <p>Access archived shipments from two sources: the database and backup files.</p>

            <h3>Database Archives</h3>
            <p>Shipments with "archived" status stored in the database. These are searchable in a table with columns for Order Ref, Supplier, Product, Quantity, Pallets, Warehouse, and Archived Date. Click Order Ref to view full details.</p>

            <h3>File Archives</h3>
            <p>JSON backup files created during manual or automatic archiving operations. Each file shows:</p>
            <ul>
              <li><strong>Archive Name</strong> — Editable inline (click to rename)</li>
              <li><strong>Date</strong> — When the archive was created</li>
              <li><strong>Shipment Count</strong> — Number of shipments in the file</li>
            </ul>

            <h3>Working with File Archives</h3>
            <ul>
              <li><strong>View</strong> — Expand an archive to see its contents in a searchable table</li>
              <li><strong>Search</strong> — Filter within an archive by Order Ref, Supplier, or Product</li>
              <li><strong>Edit</strong> — Edit individual shipment details within an archive</li>
              <li><strong>Rename</strong> — Click the archive name to rename it</li>
            </ul>

            <h3>Clickable Order Refs</h3>
            <p>Order Refs in both database and file archive tables are clickable to view full shipment details. The detail card handles both formats (camelCase and snake_case field names).</p>
          </div>
        );

      case 'search':
        return (
          <div>
            <h2>Global Search</h2>

            <h3>Overview</h3>
            <p>The Global Search bar at the top of the application lets you quickly find any shipment across the entire system.</p>

            <h3>How to Use</h3>
            <ol>
              <li>Click the search bar or start typing</li>
              <li>Enter at least 2 characters to see results</li>
              <li>Results appear in a dropdown as you type</li>
              <li>Click a result or press Enter to navigate to it</li>
            </ol>

            <h3>What It Searches</h3>
            <ul>
              <li><strong>Order Ref</strong> — Your internal order reference</li>
              <li><strong>Supplier</strong> — Supplier name</li>
              <li><strong>Final POD</strong> — Point of delivery</li>
              <li><strong>Vessel Name</strong> — Ship/vessel name</li>
            </ul>

            <h3>Results Display</h3>
            <p>Each result shows the Order Ref, Supplier, POD, and a color-coded status pill (Delayed, Arrived, In Transit, Planned, or Port).</p>

            <h3>Keyboard Navigation</h3>
            <ul>
              <li><strong>Arrow Up/Down</strong> — Navigate through results</li>
              <li><strong>Enter</strong> — Select highlighted result</li>
              <li><strong>Escape</strong> — Close the dropdown</li>
            </ul>

            <p>Selecting a result navigates to the Shipping Schedule with the search term pre-filled.</p>
          </div>
        );

      case 'settings':
        return (
          <div>
            <h2>User Settings</h2>

            <h3>Changing Your Password</h3>
            <ol>
              <li>Click <strong>Settings</strong> in the sidebar footer</li>
              <li>Enter your current password</li>
              <li>Enter new password (minimum 6 characters)</li>
              <li>Confirm new password</li>
              <li>Click "Change Password"</li>
              <li>You'll be logged out — login with your new password</li>
            </ol>

            <h3>Password Requirements</h3>
            <ul>
              <li>Minimum 6 characters</li>
              <li>Recommended: Mix of letters, numbers, and symbols</li>
            </ul>

            <h3>Profile Information</h3>
            <p>View your account details: Username, Email, Full Name, and Role (User or Admin).</p>

            <h3>Security Tips</h3>
            <ul>
              <li>Always logout when leaving your computer</li>
              <li>Don't save passwords in the browser on shared computers</li>
              <li>Report suspicious activity to your administrator</li>
              <li>Sessions expire after 7 days — you'll need to login again</li>
            </ul>
          </div>
        );

      case 'notifications':
        return (
          <div>
            <h2>Notification Preferences</h2>

            <h3>Overview</h3>
            <p>Configure how and when you receive email notifications about shipment events.</p>

            <h3>Settings</h3>
            <ul>
              <li><strong>Notification Email</strong> — Set a custom email or use your account email</li>
              <li><strong>Email Frequency</strong> — Choose Immediate, Daily digest, or Weekly digest</li>
              <li><strong>Enable/Disable</strong> — Toggle email notifications on or off</li>
            </ul>

            <h3>Event Types</h3>
            <p>Choose which events trigger notifications:</p>
            <ul>
              <li><strong>Shipment Arrival</strong> — When a shipment reaches its destination</li>
              <li><strong>Inspection Failed</strong> — When an inspection does not pass</li>
              <li><strong>Inspection Passed</strong> — When an inspection is approved</li>
              <li><strong>Warehouse Capacity Alert</strong> — When a warehouse approaches capacity</li>
              <li><strong>Delayed Shipment</strong> — When a shipment is flagged as delayed</li>
            </ul>

            <h3>Test Notifications</h3>
            <p>Use the "Send Test Email" button to verify your notification setup is working correctly.</p>
          </div>
        );

      case 'admin':
        return isAdmin ? (
          <div>
            <h2>Admin Functions</h2>

            <h3>User Management</h3>
            <p>Access User Management from the sidebar footer (admin only).</p>

            <h4>Creating Users</h4>
            <ol>
              <li>Go to <strong>User Management</strong></li>
              <li>Fill in: Username (required), Email, Full Name, Password (min 6 characters), Role</li>
              <li>Click "Create User"</li>
              <li>Give the user their username and temporary password</li>
              <li>Instruct them to change their password on first login via Settings</li>
            </ol>

            <h4>Editing Users</h4>
            <ul>
              <li>Click "Edit" on any user row</li>
              <li>Update username, email, full name, role, or active status</li>
              <li>Deactivate accounts by toggling the "Active" switch</li>
            </ul>

            <h4>Resetting Passwords</h4>
            <ul>
              <li>Click "Reset Password" on a user row</li>
              <li>Enter a new temporary password (min 6 characters)</li>
              <li>The user will need to login with the new password</li>
            </ul>

            <h3>User Roles</h3>
            <ul>
              <li><strong>User</strong> — Standard access to all views, can update data and manage shipments</li>
              <li><strong>Admin</strong> — Full access plus: create/edit users, "Skip to Stored" in Post-Arrival Workflow, access User Management</li>
            </ul>

            <h3>Admin: Skip to Stored</h3>
            <p>In the Post-Arrival Workflow, admins see a "Skip to Stored" button on each shipment. This bypasses all workflow stages (unloading, inspection, receiving) and instantly marks the shipment as stored. Only partially-filled fields get auto-completed — any data already entered is preserved.</p>

            <h3>Audit Trail</h3>
            <p>Warehouse capacity changes are tracked with usernames and timestamps. View the history through the warehouse capacity API.</p>

            <h3>System Architecture</h3>
            <ul>
              <li><strong>Database</strong> — PostgreSQL hosted on Railway</li>
              <li><strong>Frontend</strong> — React deployed on Vercel</li>
              <li><strong>Backend</strong> — Node.js API on Railway</li>
              <li><strong>Backups</strong> — Automated daily backups via Railway</li>
            </ul>
          </div>
        ) : null;

      default:
        return <p>Section not found</p>;
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        width: '90%',
        maxWidth: '1200px',
        height: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 30px',
          borderBottom: '2px solid #e1e5e9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ margin: 0, color: '#2c3e50', fontSize: '24px' }}>
            Help & User Guide
          </h1>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: '#666',
              padding: '5px 10px'
            }}
          >
            x
          </button>
        </div>

        {/* Content Area */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar Navigation */}
          <div style={{
            width: '250px',
            borderRight: '1px solid #e1e5e9',
            overflowY: 'auto',
            padding: '20px 0'
          }}>
            {Object.entries(sections).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  border: 'none',
                  backgroundColor: activeSection === key ? '#059669' : 'transparent',
                  color: activeSection === key ? 'white' : '#2c3e50',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: activeSection === key ? '600' : '400',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (activeSection !== key) {
                    e.target.style.backgroundColor = '#f8f9fa';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeSection !== key) {
                    e.target.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Main Content */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '30px'
          }}>
            <div style={{
              maxWidth: '800px',
              lineHeight: '1.6',
              color: '#333'
            }}>
              {renderContent()}
            </div>
          </div>
        </div>

        <style>{`
          h2 { color: #2c3e50; margin-top: 0; margin-bottom: 15px; }
          h3 { color: #34495e; margin-top: 25px; margin-bottom: 10px; font-size: 18px; }
          h4 { color: #34495e; margin-top: 20px; margin-bottom: 8px; font-size: 16px; }
          p { margin-bottom: 12px; }
          ul, ol { margin-bottom: 15px; padding-left: 25px; }
          li { margin-bottom: 8px; }
          code { background-color: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
          strong { color: #2c3e50; }
        `}</style>
      </div>
    </div>
  );
}

export default HelpGuide;
