// Initialize orders array from localStorage or empty array
let orders = JSON.parse(localStorage.getItem('orders')) || [];

// Google Sheets API configuration
const SPREADSHEET_ID = '18XYMquFq3MFw-26BvuJJZfFCIF2d0JnTBvA4A7hljlo';
const SHEET_NAME = 'Orders'; // or your actual sheet name/tab
const API_KEY = 'AIzaSyB9H0fzESWhk1KaI9bMbce-CzNTgmGjRTU';

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(amount);
}

// Fetch data from Google Sheets
async function fetchFromGoogleSheets() {
    try {
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}?key=${API_KEY}`
        );
        const data = await response.json();

        if (data.values && data.values.length > 1) { // Skip header row
            const header = data.values[0];
            const newOrders = data.values.slice(1).map(row => {
                return {
                    studentNumber: row[1] || '-', // Student Number
                    studentName: row[2], // Student Name
                    itemName: row[6], // Order Items
                    quantity: 1, // Default to 1
                    price: parseFloat(row[7]) || 0, // Total Amount
                    gcashReference: row[8] || '', // GCash Reference Number
                    paymentMode: row[5] || '-', // Payment Mode
                    paymentStatus: (row[5] && row[5].toLowerCase() === 'paid') ? 'paid' : 'unpaid', // Payment Status (still based on Payment Mode for now)
                    timestamp: row[0] || '', // Timestamp (raw)
                    date: row[0] // Timestamp (for merging)
                };
            });

            // Replace local orders with the new data from Google Sheets
            orders = newOrders;
            saveOrders();
            updateOrdersList();
            showNotification('Data synchronized successfully!', 'success');
        }
    } catch (error) {
        console.error('Error fetching from Google Sheets:', error);
        showNotification('Error syncing with Google Sheets', 'error');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} notification`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Add new order
function addOrder(event) {
    event.preventDefault();
    const studentNumber = document.getElementById('studentNumber').value;
    const studentName = document.getElementById('studentName').value;
    const itemName = document.getElementById('itemName').value;
    const quantity = parseInt(document.getElementById('quantity').value);
    const price = parseFloat(document.getElementById('price').value);
    const gcashReference = document.getElementById('gcashReference').value;
    const paymentMode = document.getElementById('paymentMode').value || '-';
    const paymentStatus = document.getElementById('paymentStatus').value;
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    const date = now.toISOString();
    const order = {
        studentNumber,
        studentName,
        itemName,
        quantity,
        price,
        gcashReference,
        paymentMode,
        paymentStatus,
        timestamp,
        date
    };
    orders.push(order);
    saveOrders();
    updateOrdersList();
    event.target.reset();
}

// Save orders to localStorage
function saveOrders() {
    localStorage.setItem('orders', JSON.stringify(orders));
}

let searchQuery = '';
let filterStartDate = '';
let filterEndDate = '';
let filterPaymentStatus = '';
let filterPaymentMode = '';
let filterOrderCount = '';

function updateOrdersList() {
    const ordersList = document.getElementById('ordersList');
    ordersList.innerHTML = '';
    
    // First, group orders by student number to identify same students
    const studentGroups = {};
    orders.forEach(order => {
        if (!studentGroups[order.studentNumber]) {
            studentGroups[order.studentNumber] = [];
        }
        studentGroups[order.studentNumber].push(order);
    });

    // Always group by student number and timestamp
    let grouped = {};
    orders.forEach(order => {
        const key = `${order.studentNumber}_${order.timestamp}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(order);
    });

    let orderKeys = Object.keys(grouped);
    // When 'Multiple Orders' is selected, filter to only students with >1 order
    if (filterOrderCount === 'multiple') {
        orderKeys = orderKeys.filter(key => {
            const studentNumber = grouped[key][0].studentNumber;
            return studentGroups[studentNumber].length > 1;
        });
        // Sort so that all orders from the same student are consecutive, newest first within student
        orderKeys.sort((a, b) => {
            const aStudent = grouped[a][0].studentNumber;
            const bStudent = grouped[b][0].studentNumber;
            if (aStudent === bStudent) {
                // Sort by timestamp descending within the same student
                const aDate = new Date(grouped[a][0].timestamp);
                const bDate = new Date(grouped[b][0].timestamp);
                return bDate - aDate;
            }
            // Otherwise, sort by student number
            return aStudent.localeCompare(bStudent);
        });
    } else {
        // Default: sort by timestamp (newest first)
        orderKeys.sort((a, b) => {
            const aDate = new Date(grouped[a][0].timestamp);
            const bDate = new Date(grouped[b][0].timestamp);
            return bDate - aDate;
        });
    }

    orderKeys.forEach((key, groupIdx) => {
        const group = grouped[key];
        const studentNumber = group[0].studentNumber;
        // Check if this student has multiple orders
        const isSameStudent = studentGroups[studentNumber].length > 1;
        // Filter by single/multiple order filter
        if (filterOrderCount === 'single' && isSameStudent) return;
        if (filterOrderCount === 'multiple' && !isSameStudent) return;
        
        // Collect all items for this order
        let allItems = [];
        group.forEach(order => {
            const items = order.itemName.split(',').map(i => i.trim()).filter(i => i);
            items.forEach(itemStr => {
                let itemMatch = itemStr.match(/^(.*?)(?:\s*\((\d+)x\))?$/);
                let itemName = itemMatch ? itemMatch[1].trim() : itemStr;
                let quantity = itemMatch && itemMatch[2] ? parseInt(itemMatch[2]) : 1;
                allItems.push({
                    itemName,
                    quantity,
                    order
                });
            });
        });

        // Filter by search query and filters
        const matchesSearch = (
            group[0].studentNumber.toLowerCase().includes(searchQuery) ||
            group[0].studentName.toLowerCase().includes(searchQuery) ||
            allItems.some(item => item.itemName.toLowerCase().includes(searchQuery)) ||
            group[0].gcashReference?.toLowerCase().includes(searchQuery)
        );
        if (!matchesSearch && searchQuery) return;
        // Filter by payment status
        if (filterPaymentStatus && group[0].paymentStatus !== filterPaymentStatus) return;
        // Filter by payment mode
        if (filterPaymentMode && group[0].paymentMode.toLowerCase() !== filterPaymentMode.toLowerCase()) return;
        // Filter by date range
        if (filterStartDate || filterEndDate) {
            let orderDate = '';
            if (group[0].timestamp && group[0].timestamp.length > 0) {
                // Try to parse as ISO or YYYY-MM-DD
                if (group[0].timestamp.length > 10 && group[0].timestamp.includes('T')) {
                    orderDate = group[0].timestamp.split('T')[0];
                } else {
                    orderDate = group[0].timestamp.split(' ')[0];
                }
            }
            if (filterStartDate && orderDate < filterStartDate) return;
            if (filterEndDate && orderDate > filterEndDate) return;
        }

        // Use the price from the first order as the total (do not multiply by quantity)
        const total = group[0].price;
        // Use the first order for student info
        const firstOrder = group[0];
        // Format timestamp for display
        let displayTimestamp = '-';
        if (firstOrder.timestamp) {
            if (firstOrder.timestamp.length > 10 && firstOrder.timestamp.includes('T')) {
                const d = new Date(firstOrder.timestamp);
                displayTimestamp = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            } else {
                displayTimestamp = firstOrder.timestamp;
            }
        }

        // Determine group class for coloring
        const groupClass = groupIdx % 2 === 0 ? 'student-group-even' : 'student-group-odd';
        // Add same-student class if this student has multiple orders
        const rowClass = `${groupClass}${isSameStudent ? ' same-student' : ''}`;

        // Render rows with rowspan for student info and summary columns
        allItems.forEach((item, idx) => {
            const row = document.createElement('tr');
            row.className = rowClass;
            let cells = '';
            if (idx === 0) {
                const studentNameDisplay = isSameStudent 
                    ? `${firstOrder.studentName}<span class="same-student-indicator">(Multiple Orders)</span>`
                    : firstOrder.studentName;
                cells += `<td rowspan="${allItems.length}">${firstOrder.studentNumber}</td>`;
                cells += `<td rowspan="${allItems.length}">${studentNameDisplay}</td>`;
            }
            cells += `<td>${item.itemName}</td>`;
            cells += `<td>${item.quantity}</td>`;
            if (idx === 0) {
                cells += `<td rowspan="${allItems.length}">${formatCurrency(total)}</td>`;
                cells += `<td rowspan="${allItems.length}">${firstOrder.gcashReference ? firstOrder.gcashReference : '-'}</td>`;
                cells += `<td rowspan="${allItems.length}">${firstOrder.paymentMode ? firstOrder.paymentMode : '-'}</td>`;
                cells += `<td rowspan="${allItems.length}">${displayTimestamp}</td>`;
                cells += `<td rowspan="${allItems.length}"><span class="payment-status ${firstOrder.paymentStatus}">${firstOrder.paymentStatus.charAt(0).toUpperCase() + firstOrder.paymentStatus.slice(1)}</span></td>`;
                cells += `<td rowspan="${allItems.length}" class="action-buttons">
                    <button class="btn btn-sm btn-success" onclick="markAllPaid('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">Mark Paid</button>
                    <button class="btn btn-sm btn-warning" onclick="markAllUnpaid('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">Mark Unpaid</button>
                </td>`;
            }
            row.innerHTML = cells;
            ordersList.appendChild(row);
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            searchQuery = e.target.value.toLowerCase();
            updateOrdersList();
        });
    }
    const startDateInput = document.getElementById('filterStartDate');
    if (startDateInput) {
        startDateInput.addEventListener('change', function(e) {
            filterStartDate = e.target.value;
            updateOrdersList();
        });
    }
    const endDateInput = document.getElementById('filterEndDate');
    if (endDateInput) {
        endDateInput.addEventListener('change', function(e) {
            filterEndDate = e.target.value;
            updateOrdersList();
        });
    }
    const paymentStatusInput = document.getElementById('filterPaymentStatus');
    if (paymentStatusInput) {
        paymentStatusInput.addEventListener('change', function(e) {
            filterPaymentStatus = e.target.value;
            updateOrdersList();
        });
    }
    const paymentModeInput = document.getElementById('filterPaymentMode');
    if (paymentModeInput) {
        paymentModeInput.addEventListener('change', function(e) {
            filterPaymentMode = e.target.value;
            updateOrdersList();
        });
    }
    const orderCountInput = document.getElementById('filterOrderCount');
    if (orderCountInput) {
        orderCountInput.addEventListener('change', function(e) {
            filterOrderCount = e.target.value;
            updateOrdersList();
        });
    }
    updateOrdersList();
});

// Mark all orders for a student number and timestamp as paid
function markAllPaid(studentNumber, timestamp) {
    orders.forEach(order => {
        if (order.studentNumber === studentNumber && order.timestamp === timestamp) {
            order.paymentStatus = 'paid';
        }
    });
    saveOrders();
    updateOrdersList();
}

// Mark all orders for a student number and timestamp as unpaid
function markAllUnpaid(studentNumber, timestamp) {
    orders.forEach(order => {
        if (order.studentNumber === studentNumber && order.timestamp === timestamp) {
            order.paymentStatus = 'unpaid';
        }
    });
    saveOrders();
    updateOrdersList();
}

// Initialize the form submission handler
const orderForm = document.getElementById('orderForm');
if (orderForm) {
    orderForm.addEventListener('submit', addOrder);
}
// Add sync button handler
const syncButton = document.getElementById('syncButton');
if (syncButton) {
    syncButton.addEventListener('click', fetchFromGoogleSheets);
} 