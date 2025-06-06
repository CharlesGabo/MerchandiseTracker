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
                    studentName: row[2], // Student Name
                    itemName: row[6], // Order Items
                    quantity: 1, // Default to 1
                    price: parseFloat(row[7]) || 0, // Total Amount
                    paymentStatus: (row[5] && row[5].toLowerCase() === 'paid') ? 'paid' : 'unpaid', // Payment Mode
                    date: row[0] // Timestamp
                };
            });

            // Merge with existing orders, avoiding duplicates (by studentName, itemName, and date)
            newOrders.forEach(newOrder => {
                const existingIndex = orders.findIndex(o =>
                    o.studentName === newOrder.studentName &&
                    o.itemName === newOrder.itemName &&
                    o.date === newOrder.date
                );
                if (existingIndex === -1) {
                    orders.push(newOrder);
                } else {
                    orders[existingIndex] = newOrder;
                }
            });

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
    const studentName = document.getElementById('studentName').value;
    const itemName = document.getElementById('itemName').value;
    const quantity = parseInt(document.getElementById('quantity').value);
    const price = parseFloat(document.getElementById('price').value);
    const paymentStatus = document.getElementById('paymentStatus').value;
    const date = new Date().toISOString();
    const order = {
        studentName,
        itemName,
        quantity,
        price,
        paymentStatus,
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

// Update the orders list in the table
function updateOrdersList() {
    const ordersList = document.getElementById('ordersList');
    ordersList.innerHTML = '';
    orders.forEach(order => {
        const row = document.createElement('tr');
        const total = order.quantity * order.price;
        row.innerHTML = `
            <td>${order.studentName}</td>
            <td>${order.itemName}</td>
            <td>${order.quantity}</td>
            <td>${formatCurrency(order.price)}</td>
            <td>${formatCurrency(total)}</td>
            <td>
                <span class="payment-status ${order.paymentStatus}">
                    ${order.paymentStatus.charAt(0).toUpperCase() + order.paymentStatus.slice(1)}
                </span>
            </td>
            <td class="action-buttons">
                <button class="btn btn-sm btn-success" onclick="updatePaymentStatusByIndex(${orders.indexOf(order)}, 'paid')">
                    Mark Paid
                </button>
                <button class="btn btn-sm btn-warning" onclick="updatePaymentStatusByIndex(${orders.indexOf(order)}, 'unpaid')">
                    Mark Unpaid
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteOrderByIndex(${orders.indexOf(order)})">
                    Delete
                </button>
            </td>
        `;
        ordersList.appendChild(row);
    });
}

// Update payment status by index
function updatePaymentStatusByIndex(index, newStatus) {
    if (orders[index]) {
        orders[index].paymentStatus = newStatus;
        saveOrders();
        updateOrdersList();
    }
}

// Delete order by index
function deleteOrderByIndex(index) {
    if (confirm('Are you sure you want to delete this order?')) {
        orders.splice(index, 1);
        saveOrders();
        updateOrdersList();
    }
}

// Initialize the form submission handler
document.getElementById('orderForm').addEventListener('submit', addOrder);
// Add sync button handler
document.getElementById('syncButton').addEventListener('click', fetchFromGoogleSheets);
// Initial load of orders
updateOrdersList(); 