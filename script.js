// Initialize orders array from localStorage or empty array
let orders = JSON.parse(localStorage.getItem('orders')) || [];
let inProcessOrders = JSON.parse(localStorage.getItem('inProcessOrders')) || [];
let orderHistory = JSON.parse(localStorage.getItem('orderHistory')) || [];

// Google Sheets API configuration
const SPREADSHEET_ID = '18XYMquFq3MFw-26BvuJJZfFCIF2d0JnTBvA4A7hljlo';
const SHEET_NAME = 'Orders'; // or your actual sheet name/tab
const API_KEY = 'AIzaSyB9H0fzESWhk1KaI9bMbce-CzNTgmGjRTU';

// Add event listener for page load
document.addEventListener('DOMContentLoaded', () => {
    fetchFromGoogleSheets();
});

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

            // Only add orders not in inProcessOrders or orderHistory
            const inProcessKeys = new Set(inProcessOrders.map(o => `${o.studentNumber}_${o.timestamp}`));
            const historyKeys = new Set(orderHistory.map(o => `${o.studentNumber}_${o.timestamp}`));
            const existingKeys = new Set(orders.map(o => `${o.studentNumber}_${o.timestamp}`));
            const filteredOrders = newOrders.filter(order => {
                const key = `${order.studentNumber}_${order.timestamp}`;
                return !inProcessKeys.has(key) && !historyKeys.has(key) && !existingKeys.has(key);
            });

            // Add only new filtered orders to the current orders array
            orders = orders.concat(filteredOrders);
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
    localStorage.setItem('inProcessOrders', JSON.stringify(inProcessOrders));
    localStorage.setItem('orderHistory', JSON.stringify(orderHistory));
}

let searchQuery = '';
let filterStartDate = '';
let filterEndDate = '';
let filterPaymentStatus = '';
let filterPaymentMode = '';
let filterOrderCount = '';
let historyFilterStartDate = '';
let historyFilterEndDate = '';

function updateOrdersList() {
    const ordersList = document.getElementById('ordersList');
    const inProcessList = document.getElementById('inProcessList');
    const orderHistoryList = document.getElementById('orderHistoryList');
    ordersList.innerHTML = '';
    inProcessList.innerHTML = '';
    orderHistoryList.innerHTML = '';
    
    // First, group orders by student number to identify same students
    const studentGroups = {};
    orders.forEach(order => {
        if (!studentGroups[order.studentNumber]) {
            studentGroups[order.studentNumber] = [];
        }
        studentGroups[order.studentNumber].push(order);
    });

    // Group orders by date
    const dateGroups = {};
    orders.forEach(order => {
        let orderDate = '';
        if (order.timestamp) {
            if (order.timestamp.length > 10 && order.timestamp.includes('T')) {
                orderDate = order.timestamp.split('T')[0];
            } else {
                orderDate = order.timestamp.split(' ')[0];
            }
        }
        if (!dateGroups[orderDate]) {
            dateGroups[orderDate] = [];
        }
        dateGroups[orderDate].push(order);
    });

    // Sort dates in descending order (newest first)
    const sortedDates = Object.keys(dateGroups).sort((a, b) => {
        // Parse as date (YYYY-MM-DD or M/D/YYYY)
        const parseDate = (str) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str);
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
                const [m, d, y] = str.split('/');
                return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
            }
            return new Date(str);
        };
        return parseDate(b) - parseDate(a);
    });

    // Process each date group
    sortedDates.forEach(date => {
        const dateOrders = dateGroups[date];
        
        // Group orders by student number and timestamp within each date
        let grouped = {};
        dateOrders.forEach(order => {
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
                    const aDate = new Date(grouped[a][0].timestamp);
                    const bDate = new Date(grouped[b][0].timestamp);
                    return bDate - aDate;
                }
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

        // Add date header
        const dateHeader = document.createElement('tr');
        dateHeader.className = 'date-header';
        dateHeader.innerHTML = `<td colspan="10" class="bg-light fw-bold">${date}</td>`;
        ordersList.appendChild(dateHeader);

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
                    if (group[0].timestamp.length > 10 && group[0].timestamp.includes('T')) {
                        orderDate = group[0].timestamp.split('T')[0];
                    } else {
                        orderDate = group[0].timestamp.split(' ')[0];
                    }
                }
                if (filterStartDate && orderDate < filterStartDate) return;
                if (filterEndDate && orderDate > filterEndDate) return;
            }

            // Use the price from the first order as the total
            const total = group[0].price;
            // Use the first order for student info
            const firstOrder = group[0];
            // Format timestamp for display
            let displayTimestamp = '-';
            if (firstOrder.timestamp) {
                if (firstOrder.timestamp.length > 10 && firstOrder.timestamp.includes('T')) {
                    const d = new Date(firstOrder.timestamp);
                    displayTimestamp = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
                } else {
                    displayTimestamp = firstOrder.timestamp.split(' ')[1] || firstOrder.timestamp;
                }
            }

            // Determine group class for coloring
            const groupClass = groupIdx % 2 === 0 ? 'student-group-even' : 'student-group-odd';
            // Add same-student class if this student has multiple orders
            const rowClass = `${groupClass}${isSameStudent ? ' same-student' : ''}`;

            // Create the row
            const row = document.createElement('tr');
            row.className = rowClass;
            row.innerHTML = `
                <td>${firstOrder.studentNumber}</td>
                <td>${firstOrder.studentName}</td>
                <td>${allItems.map(item => `${item.itemName} (${item.quantity}x)`).join('<br>')}</td>
                <td>${allItems.reduce((sum, item) => sum + item.quantity, 0)}</td>
                <td>${formatCurrency(total)}</td>
                <td>${firstOrder.gcashReference || '-'}</td>
                <td>${firstOrder.paymentMode}</td>
                <td>${displayTimestamp}</td>
                <td>
                    <span class="badge ${firstOrder.paymentStatus === 'paid' ? 'bg-success' : 'bg-warning'}">
                        ${firstOrder.paymentStatus}
                    </span>
                </td>
                <td>
                    <div class="btn-group">
                        ${firstOrder.paymentStatus === 'unpaid' ? 
                            `<button class="btn btn-sm btn-success" onclick="markAllPaid('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">
                                <i class="bi bi-check-circle"></i>
                            </button>
                            <button class="btn btn-sm btn-primary" disabled title="Pay first before processing">
                                <i class="bi bi-arrow-right-circle"></i>
                            </button>` :
                            `<button class="btn btn-sm btn-warning" onclick="markAllUnpaid('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">
                                <i class="bi bi-x-circle"></i>
                            </button>
                            <button class="btn btn-sm btn-primary" onclick="markAsInProcess('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">
                                <i class="bi bi-arrow-right-circle"></i>
                            </button>`
                        }
                    </div>
                </td>
            `;
            ordersList.appendChild(row);
        });
    });

    // Update In-Process orders list
    // Group inProcessOrders by student number and timestamp
    let inProcessGrouped = {};
    inProcessOrders.forEach(order => {
        const key = `${order.studentNumber}_${order.timestamp}`;
        if (!inProcessGrouped[key]) inProcessGrouped[key] = [];
        inProcessGrouped[key].push(order);
    });
    let inProcessKeys = Object.keys(inProcessGrouped);
    // Sort by timestamp (newest first)
    inProcessKeys.sort((a, b) => {
        const aDate = new Date(inProcessGrouped[a][0].timestamp);
        const bDate = new Date(inProcessGrouped[b][0].timestamp);
        return bDate - aDate;
    });
    inProcessKeys.forEach((key, groupIdx) => {
        const group = inProcessGrouped[key];
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
        // Search filter for in-process
        const matchesSearch = (
            group[0].studentNumber.toLowerCase().includes(searchQuery) ||
            group[0].studentName.toLowerCase().includes(searchQuery) ||
            allItems.some(item => item.itemName.toLowerCase().includes(searchQuery)) ||
            group[0].gcashReference?.toLowerCase().includes(searchQuery)
        );
        if (!matchesSearch && searchQuery) return;
        const firstOrder = group[0];
        const total = firstOrder.price;
        let displayTimestamp = '-';
        if (firstOrder.timestamp) {
            if (firstOrder.timestamp.length > 10 && firstOrder.timestamp.includes('T')) {
                const d = new Date(firstOrder.timestamp);
                displayTimestamp = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            } else {
                displayTimestamp = firstOrder.timestamp;
            }
        }
        allItems.forEach((item, idx) => {
            const row = document.createElement('tr');
            let cells = '';
            if (idx === 0) {
                cells += `<td rowspan="${allItems.length}">${firstOrder.studentNumber}</td>`;
                cells += `<td rowspan="${allItems.length}">${firstOrder.studentName}</td>`;
            }
            cells += `<td>${item.itemName}</td>`;
            cells += `<td>${item.quantity}</td>`;
            if (idx === 0) {
                cells += `<td rowspan="${allItems.length}">${formatCurrency(total)}</td>`;
                cells += `<td rowspan="${allItems.length}">${firstOrder.gcashReference || '-'}</td>`;
                cells += `<td rowspan="${allItems.length}">${firstOrder.paymentMode || '-'}</td>`;
                cells += `<td rowspan="${allItems.length}">${displayTimestamp}</td>`;
                cells += `<td rowspan="${allItems.length}"><span class="payment-status ${firstOrder.paymentStatus}">${firstOrder.paymentStatus.charAt(0).toUpperCase() + firstOrder.paymentStatus.slice(1)}</span></td>`;
                cells += `<td rowspan="${allItems.length}" class="action-buttons">
                    <button class="btn btn-sm btn-success" onclick="markAsComplete('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">
                        <i class="bi bi-check-circle"></i> Claimed
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="revertToOrders('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">
                        <i class="bi bi-arrow-left-circle"></i> Revert
                    </button>
                </td>`;
            }
            row.innerHTML = cells;
            inProcessList.appendChild(row);
        });
    });

    // Update Order History list
    // Group orderHistory by student number and timestamp
    let historyGrouped = {};
    orderHistory.forEach(order => {
        const key = `${order.studentNumber}_${order.timestamp}`;
        if (!historyGrouped[key]) historyGrouped[key] = [];
        historyGrouped[key].push(order);
    });
    let historyKeys = Object.keys(historyGrouped);
    // Sort by timestamp (newest first)
    historyKeys.sort((a, b) => {
        const aDate = new Date(historyGrouped[a][0].timestamp);
        const bDate = new Date(historyGrouped[b][0].timestamp);
        return bDate - aDate;
    });
    historyKeys.forEach((key, groupIdx) => {
        const group = historyGrouped[key];
        const firstOrder = group[0];
        // Filter by claim date range
        if (historyFilterStartDate || historyFilterEndDate) {
            let claimDate = firstOrder.claimDate ? firstOrder.claimDate.split(' ')[0] : '';
            if (historyFilterStartDate && claimDate < historyFilterStartDate) return;
            if (historyFilterEndDate && claimDate > historyFilterEndDate) return;
        }
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
        // Search filter for order history
        const matchesSearch = (
            group[0].studentNumber.toLowerCase().includes(searchQuery) ||
            group[0].studentName.toLowerCase().includes(searchQuery) ||
            allItems.some(item => item.itemName.toLowerCase().includes(searchQuery)) ||
            group[0].gcashReference?.toLowerCase().includes(searchQuery)
        );
        if (!matchesSearch && searchQuery) return;
        const total = firstOrder.price;
        let displayTimestamp = '-';
        if (firstOrder.timestamp) {
            if (firstOrder.timestamp.length > 10 && firstOrder.timestamp.includes('T')) {
                const d = new Date(firstOrder.timestamp);
                displayTimestamp = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            } else {
                displayTimestamp = firstOrder.timestamp;
            }
        }
        allItems.forEach((item, idx) => {
            const row = document.createElement('tr');
            let cells = '';
            if (idx === 0) {
                cells += `<td rowspan="${allItems.length}">${firstOrder.studentNumber}</td>`;
                cells += `<td rowspan="${allItems.length}">${firstOrder.studentName}</td>`;
            }
            cells += `<td>${item.itemName}</td>`;
            cells += `<td>${item.quantity}</td>`;
            if (idx === 0) {
                cells += `<td rowspan="${allItems.length}">${formatCurrency(total)}</td>`;
                cells += `<td rowspan="${allItems.length}">${firstOrder.gcashReference || '-'}</td>`;
                cells += `<td rowspan="${allItems.length}">${firstOrder.paymentMode || '-'}</td>`;
                cells += `<td rowspan="${allItems.length}">${displayTimestamp}</td>`;
                cells += `<td rowspan="${allItems.length}"><span class="payment-status ${firstOrder.paymentStatus}">${firstOrder.paymentStatus.charAt(0).toUpperCase() + firstOrder.paymentStatus.slice(1)}</span></td>`;
                cells += `<td rowspan="${allItems.length}">${firstOrder.claimDate || '-'}</td>`;
                cells += `<td rowspan="${allItems.length}" class="action-buttons">
                    <button class="btn btn-sm btn-danger" onclick="deleteHistoryOrder('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </td>`;
            }
            row.innerHTML = cells;
            orderHistoryList.appendChild(row);
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
    const historyStartDateInput = document.getElementById('historyStartDate');
    if (historyStartDateInput) {
        historyStartDateInput.addEventListener('change', function(e) {
            historyFilterStartDate = e.target.value;
            updateOrdersList();
        });
    }
    const historyEndDateInput = document.getElementById('historyEndDate');
    if (historyEndDateInput) {
        historyEndDateInput.addEventListener('change', function(e) {
            historyFilterEndDate = e.target.value;
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

// Mark order as in-process
function markAsInProcess(studentNumber, timestamp) {
    const orderToMove = orders.find(order => 
        order.studentNumber === studentNumber && order.timestamp === timestamp
    );
    
    if (orderToMove) {
        inProcessOrders.push(orderToMove);
        orders = orders.filter(order => 
            !(order.studentNumber === studentNumber && order.timestamp === timestamp)
        );
        saveOrders();
        updateOrdersList();
        showNotification('Order moved to In-Process', 'success');
    }
}

// Mark order as complete
function markAsComplete(studentNumber, timestamp) {
    // Prompt for verification
    const confirmation = prompt("Type 'claimed' to confirm this order is claimed:");
    if (!confirmation || confirmation.trim().toLowerCase() !== 'claimed') {
        showNotification("Order not marked as claimed. Please type 'claimed' to confirm.", 'warning');
        return;
    }
    const orderToMove = inProcessOrders.find(order => 
        order.studentNumber === studentNumber && order.timestamp === timestamp
    );
    
    if (orderToMove) {
        // Add claim date to the order
        const now = new Date();
        orderToMove.claimDate = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        
        // Move to order history instead of back to orders
        orderHistory.push(orderToMove);
        inProcessOrders = inProcessOrders.filter(order => 
            !(order.studentNumber === studentNumber && order.timestamp === timestamp)
        );
        saveOrders();
        updateOrdersList();
        showNotification('Order marked as claimed and moved to history', 'success');
    }
}

// Revert order back to Orders list
function revertToOrders(studentNumber, timestamp) {
    const orderToMove = inProcessOrders.find(order => 
        order.studentNumber === studentNumber && order.timestamp === timestamp
    );
    
    if (orderToMove) {
        orders.push(orderToMove);
        inProcessOrders = inProcessOrders.filter(order => 
            !(order.studentNumber === studentNumber && order.timestamp === timestamp)
        );
        saveOrders();
        updateOrdersList();
        showNotification('Order reverted back to Orders list', 'info');
    }
}

// Delete order from history
function deleteHistoryOrder(studentNumber, timestamp) {
    const confirmation = prompt("Type 'delete' to confirm deletion of this order from history:");
    if (!confirmation || confirmation.trim().toLowerCase() !== 'delete') {
        showNotification("Order not deleted. Please type 'delete' to confirm.", 'warning');
        return;
    }
    orderHistory = orderHistory.filter(order => !(order.studentNumber === studentNumber && order.timestamp === timestamp));
    saveOrders();
    updateOrdersList();
    showNotification('Order deleted from history.', 'info');
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

// Export All Orders to Excel
function exportAllOrdersToExcel() {
    if (!inProcessOrders.length && !orderHistory.length) {
        showNotification('No orders to export.', 'warning');
        return;
    }

    // Create workbook with two sheets
    const wb = XLSX.utils.book_new();

    // Export In-Process Orders
    if (inProcessOrders.length > 0) {
        const inProcessData = prepareOrdersForExport(inProcessOrders, false);
        const wsInProcess = XLSX.utils.json_to_sheet(inProcessData);
        formatWorksheet(wsInProcess, inProcessData);
        XLSX.utils.book_append_sheet(wb, wsInProcess, 'In-Process Orders');
    }

    // Export Order History
    if (orderHistory.length > 0) {
        const historyData = prepareOrdersForExport(orderHistory, true);
        const wsHistory = XLSX.utils.json_to_sheet(historyData);
        formatWorksheet(wsHistory, historyData);
        XLSX.utils.book_append_sheet(wb, wsHistory, 'Order History');
    }

    // Export to file
    XLSX.writeFile(wb, 'All_Orders.xlsx');
    showNotification('Successfully exported all orders.', 'success');
}

// Helper function to prepare orders for export
function prepareOrdersForExport(orders, isHistory) {
    const exportData = [];
    let grouped = {};
    
    // Group orders by student number and timestamp
    orders.forEach(order => {
        const key = `${order.studentNumber}_${order.timestamp}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(order);
    });

    let orderKeys = Object.keys(grouped);
    // Sort by timestamp (newest first)
    orderKeys.sort((a, b) => {
        const aDate = new Date(grouped[a][0].timestamp);
        const bDate = new Date(grouped[b][0].timestamp);
        return bDate - aDate;
    });

    orderKeys.forEach(key => {
        const group = grouped[key];
        const firstOrder = group[0];
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

        allItems.forEach((item, idx) => {
            const rowData = {
                'Student Number': idx === 0 ? firstOrder.studentNumber : '',
                'Student Name': idx === 0 ? firstOrder.studentName : '',
                'Item': item.itemName,
                'Quantity': item.quantity,
                'Total': idx === 0 && firstOrder.price !== '' ? `₱${firstOrder.price}` : '',
                'GCash Reference Number': idx === 0 ? (firstOrder.gcashReference || '-') : '',
                'Payment Mode': idx === 0 ? (firstOrder.paymentMode || '-') : '',
                'Timestamp': idx === 0 ? firstOrder.timestamp : '',
                'Payment Status': idx === 0 ? firstOrder.paymentStatus : ''
            };

            if (isHistory) {
                rowData['Claim Date'] = idx === 0 ? (firstOrder.claimDate || '-') : '';
            }

            exportData.push(rowData);
        });
    });

    return exportData;
}

// Helper function to format worksheet
function formatWorksheet(ws, data) {
    // Auto-adjust column widths
    const cols = Object.keys(data[0] || {}).map(key => {
        const maxLen = Math.max(
            key.length,
            ...data.map(row => String(row[key] ?? '').length)
        );
        return { wch: maxLen + 2 };
    });
    ws['!cols'] = cols;

    // Center Quantity, Total, and Payment Status columns
    const colKeys = Object.keys(data[0] || {});
    const centerCols = ['Quantity', 'Total', 'Payment Status'];
    
    // Center data cells
    for (let R = 1; R <= data.length; ++R) {
        centerCols.forEach(colName => {
            const C = colKeys.indexOf(colName);
            if (C !== -1) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                if (ws[cellRef]) {
                    ws[cellRef].s = ws[cellRef].s || {};
                    ws[cellRef].s.alignment = { horizontal: 'center' };
                }
            }
        });
    }

    // Center header row
    centerCols.forEach(colName => {
        const C = colKeys.indexOf(colName);
        if (C !== -1) {
            const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
            if (ws[cellRef]) {
                ws[cellRef].s = ws[cellRef].s || {};
                ws[cellRef].s.alignment = { horizontal: 'center' };
            }
        }
    });
}

// Import All Orders from Excel
function importAllOrdersFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Process each sheet
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet);
                
                if (!jsonData.length) {
                    showNotification(`No data found in sheet: ${sheetName}`, 'warning');
                    return;
                }

                // Process the imported data
                const importedOrders = [];
                let currentOrder = null;

                jsonData.forEach(row => {
                    if (row['Student Number']) {
                        // This is a new order
                        if (currentOrder) {
                            importedOrders.push(currentOrder);
                        }
                        currentOrder = {
                            studentNumber: row['Student Number'],
                            studentName: row['Student Name'],
                            itemName: row['Item'],
                            quantity: parseInt(row['Quantity']) || 1,
                            price: parseFloat(row['Total'].replace('₱', '')) || 0,
                            gcashReference: row['GCash Reference Number'] === '-' ? '' : row['GCash Reference Number'],
                            paymentMode: row['Payment Mode'] === '-' ? '' : row['Payment Mode'],
                            timestamp: row['Timestamp'],
                            paymentStatus: row['Payment Status'].toLowerCase(),
                            date: row['Timestamp']
                        };

                        if (row['Claim Date'] && row['Claim Date'] !== '-') {
                            currentOrder.claimDate = row['Claim Date'];
                        }
                    } else if (currentOrder) {
                        // This is an additional item for the current order
                        currentOrder.itemName += ', ' + row['Item'];
                    }
                });

                // Add the last order
                if (currentOrder) {
                    importedOrders.push(currentOrder);
                }

                // Update the appropriate array based on sheet name
                if (sheetName.toLowerCase().includes('history')) {
                    orderHistory = importedOrders;
                } else {
                    inProcessOrders = importedOrders;
                }
            });

            // Check for orders that should be in the Orders tab
            const allOrders = [...inProcessOrders, ...orderHistory];
            const orderKeys = new Set(orders.map(o => `${o.studentNumber}_${o.timestamp}`));
            
            // Filter out orders that are already in inProcessOrders or orderHistory
            orders = orders.filter(order => {
                const key = `${order.studentNumber}_${order.timestamp}`;
                return !allOrders.some(o => `${o.studentNumber}_${o.timestamp}` === key);
            });

            // Add any orders from inProcessOrders or orderHistory that should be in Orders
            allOrders.forEach(order => {
                const key = `${order.studentNumber}_${order.timestamp}`;
                if (!orderKeys.has(key)) {
                    // If the order is in inProcessOrders and is unpaid, add it to Orders
                    if (inProcessOrders.some(o => `${o.studentNumber}_${o.timestamp}` === key) && 
                        order.paymentStatus === 'unpaid') {
                        orders.push(order);
                    }
                }
            });

            saveOrders();
            updateOrdersList();
            showNotification('Successfully imported all orders and updated Orders tab.', 'success');
        } catch (error) {
            console.error('Error importing Excel file:', error);
            showNotification('Error importing Excel file. Please check the file format.', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

// Attach export/import button events
if (document.getElementById('exportAllBtn')) {
    document.getElementById('exportAllBtn').addEventListener('click', exportAllOrdersToExcel);
}

if (document.getElementById('importAllBtn')) {
    document.getElementById('importAllBtn').addEventListener('change', importAllOrdersFromExcel);
} 