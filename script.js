// Initialize orders array from localStorage or empty array
let orders = JSON.parse(localStorage.getItem('orders')) || [];
let inProcessOrders = JSON.parse(localStorage.getItem('inProcessOrders')) || [];
let orderHistory = JSON.parse(localStorage.getItem('orderHistory')) || [];
let deletedOrders = JSON.parse(localStorage.getItem('deletedOrders')) || [];

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

// Helper to get 4-digit order number based on Google Forms row (index + 1)
function getOrderNumberByKey(key, allKeys) {
    const idx = allKeys.indexOf(key);
    return idx >= 0 ? (idx + 1).toString().padStart(4, '0') : '----';
}

// Helper to get 4-digit order number based on Google Forms row (index + 1)
function getOrderNumberByFormIndex(formIndex) {
    return formIndex ? formIndex.toString().padStart(4, '0') : '----';
}

// Fetch data from Google Sheets
async function fetchFromGoogleSheets() {
    try {
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}?key=${API_KEY}`
        );
        const data = await response.json();

        let didChange = false;
        if (data.values && data.values.length > 1) { // Skip header row
            const header = data.values[0];
            const newOrders = data.values.slice(1).map((row, idx) => {
                return {
                    studentNumber: row[1] || '-', // Student Number
                    studentName: row[2], // Student Name
                    email: row[4] || '', // Email (Column E)
                    itemName: row[6], // Order Items
                    quantity: 1, // Default to 1
                    price: parseFloat(row[7]) || 0, // Total Amount
                    gcashReference: row[8] || '', // GCash Reference Number
                    paymentMode: row[5] || '-', // Payment Mode
                    paymentStatus: (row[5] && row[5].toLowerCase() === 'paid') ? 'paid' : 'unpaid', // Payment Status
                    timestamp: row[0] || '', // Timestamp (raw)
                    date: row[0], // Timestamp (for merging)
                    formIndex: idx + 1, // 1-based index for order number
                    notified: false // Initialize notified status
                };
            });

            // Create a set of keys for all orders in the sheet
            const sheetKeys = new Set(newOrders.map(order => `${order.studentNumber}_${order.timestamp}`));

            // Helper to move missing orders to deletedOrders
            function moveMissingToDeleted(arr) {
                const [kept, toDelete] = arr.reduce((acc, order) => {
                    const key = `${order.studentNumber}_${order.timestamp}`;
                    if (sheetKeys.has(key)) {
                        acc[0].push(order);
                    } else {
                        acc[1].push(order);
                    }
                    return acc;
                }, [[], []]);
                if (toDelete.length > 0) {
                    deletedOrders = deletedOrders.concat(toDelete);
                    didChange = true;
                }
                if (toDelete.length > 0 || kept.length !== arr.length) didChange = true;
                return kept;
            }

            // Move missing orders from all arrays
            const prevOrders = orders.length, prevInProcess = inProcessOrders.length, prevHistory = orderHistory.length, prevDeleted = deletedOrders.length;
            orders = moveMissingToDeleted(orders);
            inProcessOrders = moveMissingToDeleted(inProcessOrders);
            orderHistory = moveMissingToDeleted(orderHistory);

            // Map formIndex to all matching orders in all arrays (orders, inProcessOrders, orderHistory, deletedOrders)
            const keyToFormIndex = {};
            newOrders.forEach(order => {
                const key = `${order.studentNumber}_${order.timestamp}`;
                keyToFormIndex[key] = order.formIndex;
            });
            function assignFormIndex(arr) {
                arr.forEach(order => {
                    const key = `${order.studentNumber}_${order.timestamp}`;
                    if (keyToFormIndex[key]) {
                        order.formIndex = keyToFormIndex[key];
                    }
                });
            }
            assignFormIndex(orders);
            assignFormIndex(inProcessOrders);
            assignFormIndex(orderHistory);
            assignFormIndex(deletedOrders);

            // Only add orders not in inProcessOrders or orderHistory or orders
            const inProcessKeys = new Set(inProcessOrders.map(o => `${o.studentNumber}_${o.timestamp}`));
            const historyKeys = new Set(orderHistory.map(o => `${o.studentNumber}_${o.timestamp}`));
            const existingKeys = new Set(orders.map(o => `${o.studentNumber}_${o.timestamp}`));
            const filteredOrders = newOrders.filter(order => {
                const key = `${order.studentNumber}_${order.timestamp}`;
                return !inProcessKeys.has(key) && !historyKeys.has(key) && !existingKeys.has(key);
            });
            if (filteredOrders.length > 0) didChange = true;
            // Add only new filtered orders to the current orders array
            orders = orders.concat(filteredOrders);
        }
        saveOrders();
        updateOrdersList();
        showNotification('Data synchronized with Google Sheets.' + (didChange ? ' Changes applied.' : ' No changes detected.'), 'success');
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
        date,
        notified: false // New orders are not notified by default
    };
    normalizePaymentStatus(order);
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
    localStorage.setItem('deletedOrders', JSON.stringify(deletedOrders));
}

let searchQuery = '';
let filterStartDate = '';
let filterEndDate = '';
let filterPaymentStatus = '';
let filterPaymentMode = '';
let filterOrderCount = '';
let historyFilterStartDate = '';
let historyFilterEndDate = '';

// Variables to store pending claim action
let pendingClaimStudentNumber = null;
let pendingClaimTimestamp = null;

// Variables to store pending delete action
let pendingDeleteStudentNumber = null;
let pendingDeleteTimestamp = null;

// Variables to store pending notify action
let pendingNotifyStudentNumber = null;
let pendingNotifyTimestamp = null;

// Variables for change payment status
let pendingChangeStatusStudentNumber = null;
let pendingChangeStatusTimestamp = null;

function updateInProcessSummary() {
    const summaryDiv = document.getElementById('inProcessSummary');
    if (!summaryDiv) return;

    // Group by item and division
    const paglaomSummary = {};
    const iskolehiyoSummary = {};

    // Define ISKOLEHIYO base items (case-insensitive, ignore size info)
    const iskolehiyoBaseItems = [
        'ISKOLEHIYO T-SHIRT V1.1',
        'ISKOLEHIYO T-SHIRT V1.2',
        'ISKOLEHIYO T-SHIRT V1.3',
        'ISKOLEHIYO TOTE BAG V1.1',
        'ISKOLEHIYO TOTE BAG V1.2',
        'AIRPLANE PIN',
        'REMOVE BEFORE FLIGHT TAG'
    ];

    // Define PAGLAOM base items (case-insensitive, ignore size info)
    const paglaomBaseItems = [
        'PAGLAOM V1.1 T-SHIRT',
        'PAGLAOM V1.2 T-SHIRT',
        'Hirono Airplane Sticker',
        'Hirono Computer Enthusiasts Sticker',
        'Hirono Uniform Sticker',
        'Sticker Set A',
        'Sticker Set B'
    ];

    // Helper to extract base name (removes size info in parentheses or after last space if it's a size)
    function getBaseName(itemName) {
        // Remove size in parentheses, e.g., (S), (M), (L), (XL), (XXL), etc.
        let base = itemName.replace(/\s*\([^)]*\)\s*$/, '');
        // Remove trailing size after space, e.g., 'PAGLAOM V1.1 T-SHIRT S'
        base = base.replace(/\s+(S|M|L|XL|XXL|XS|2XL|3XL|4XL)$/i, '');
        return base.trim();
    }

    inProcessOrders.forEach(order => {
        // Split items if multiple in one order
        const items = order.itemName.split(',').map(i => i.trim()).filter(i => i);
        items.forEach(itemStr => {
            let itemMatch = itemStr.match(/^(.*?)(?:\s*\((\d+)x\))?$/);
            let rawName = itemMatch ? itemMatch[1].trim() : itemStr;
            let quantity = itemMatch && itemMatch[2] ? parseInt(itemMatch[2]) : (order.quantity || 1);
            let baseName = getBaseName(rawName);
            // Extract size (in parentheses or as trailing word)
            let size = null;
            let parenMatch = rawName.match(/\(([^)]+)\)/);
            if (parenMatch) {
                size = parenMatch[1].trim();
            } else {
                let trailing = rawName.match(/\b(S|M|L|XL|XXL|XS|2XL|3XL|4XL)\b$/i);
                if (trailing) size = trailing[1].toUpperCase();
            }

            // Create student info object
            const studentInfo = {
                studentNumber: order.studentNumber,
                studentName: order.studentName,
                quantity: quantity,
                paymentStatus: order.paymentStatus,
                timestamp: order.timestamp
            };

            // PAGLAOM base items always go to PAGLAOM
            if (paglaomBaseItems.some(b => b.toLowerCase() === baseName.toLowerCase())) {
                if (!paglaomSummary[baseName]) {
                    paglaomSummary[baseName] = { 
                        quantity: 0, 
                        sizes: {},
                        students: []
                    };
                }
                paglaomSummary[baseName].quantity += quantity;
                paglaomSummary[baseName].students.push(studentInfo);
                if (/t-shirt/i.test(baseName) && size) {
                    if (!paglaomSummary[baseName].sizes[size]) {
                        paglaomSummary[baseName].sizes[size] = { quantity: 0, students: [] };
                    }
                    paglaomSummary[baseName].sizes[size].quantity += quantity;
                    paglaomSummary[baseName].sizes[size].students.push(studentInfo);
                }
            } else if (iskolehiyoBaseItems.some(b => b.toLowerCase() === baseName.toLowerCase())) {
                if (!iskolehiyoSummary[baseName]) {
                    iskolehiyoSummary[baseName] = { 
                        quantity: 0, 
                        sizes: {},
                        students: []
                    };
                }
                iskolehiyoSummary[baseName].quantity += quantity;
                iskolehiyoSummary[baseName].students.push(studentInfo);
                if (/t-shirt/i.test(baseName) && size) {
                    if (!iskolehiyoSummary[baseName].sizes[size]) {
                        iskolehiyoSummary[baseName].sizes[size] = { quantity: 0, students: [] };
                    }
                    iskolehiyoSummary[baseName].sizes[size].quantity += quantity;
                    iskolehiyoSummary[baseName].sizes[size].students.push(studentInfo);
                }
            } else {
                if (!paglaomSummary[baseName]) {
                    paglaomSummary[baseName] = { 
                        quantity: 0,
                        students: []
                    };
                }
                paglaomSummary[baseName].quantity += quantity;
                paglaomSummary[baseName].students.push(studentInfo);
            }
        });
    });

    // Helper to build a summary table
    function buildTable(title, summaryObj, paglaomBaseOrder = []) {
        let html = `<h6 class='fw-bold mt-3 mb-2'>${title}</h6>`;
        html += '<div class="table-responsive"><table class="table table-sm table-bordered"><thead><tr><th>Item</th><th>Total Quantity</th><th>Students</th></tr></thead><tbody>';
        const items = Object.keys(summaryObj);
        let sortedItems;
        if (title === 'PAGLAOM' && paglaomBaseOrder.length > 0) {
            const baseOrdered = paglaomBaseOrder.filter(item => summaryObj[item]);
            const others = items.filter(item => !baseOrdered.includes(item)).sort();
            sortedItems = [...baseOrdered, ...others];
        } else {
            const tshirts = items.filter(item => /t-shirt/i.test(item)).sort();
            const totebags = items.filter(item => /tote bag/i.test(item)).sort();
            const others = items.filter(item => !tshirts.includes(item) && !totebags.includes(item)).sort();
            sortedItems = [...tshirts, ...totebags, ...others];
        }
        
        sortedItems.forEach((item, idx) => {
            const itemStudents = summaryObj[item].students || [];
            const uniqueStudents = itemStudents.length;
            
            if (/t-shirt/i.test(item)) {
                // Dropdown for T-SHIRT: show total, expandable to show sizes
                const collapseId = `${title.replace(/\s/g, '')}_inprocess_tshirt_${idx}`;
                const sizeMap = summaryObj[item].sizes || {};
                const hasSizes = Object.keys(sizeMap).length > 0;
                
                // Create student dropdown for main item
                const studentDropdownId = `students_inprocess_${title.replace(/\s/g, '')}_${idx}`;
                let studentDropdownHtml = '';
                if (itemStudents.length > 0) {
                    studentDropdownHtml = `<button class="btn btn-sm btn-outline-info" type="button" data-bs-toggle="collapse" data-bs-target="#${studentDropdownId}">
                        ${uniqueStudents} student${uniqueStudents > 1 ? 's' : ''} <i class="bi bi-caret-down-fill"></i>
                    </button>
                    <div class="collapse mt-2" id="${studentDropdownId}">
                        <div class="card card-body p-2">
                            <table class="table table-sm mb-0">
                                <thead><tr><th>Student</th><th>Qty</th><th>Status</th></tr></thead><tbody>`;
                    itemStudents.forEach(student => {
                        const statusClass = student.paymentStatus === 'paid' ? 'text-success' : 
                                          student.paymentStatus === 'unpaid' ? 'text-danger' : 'text-warning';
                        studentDropdownHtml += `<tr>
                            <td>${student.studentName} (${student.studentNumber})</td>
                            <td>${student.quantity}</td>
                            <td class="${statusClass}">${student.paymentStatus}</td>
                        </tr>`;
                    });
                    studentDropdownHtml += `</tbody></table></div></div>`;
                }
                
                html += `<tr data-bs-toggle='collapse' data-bs-target='#${collapseId}' style='cursor:pointer;'>
                            <td><b>${item}</b> <span class='ms-1'><i class='bi bi-caret-down-fill'></i></span></td>
                            <td><b>${summaryObj[item].quantity}</b></td>
                            <td>${studentDropdownHtml}</td>
                        </tr>`;
                if (hasSizes) {
                    // Order sizes as S, M, L, XL, 2XL, 3XL, 4XL, 5XL, then others
                    const allSizes = Object.keys(sizeMap);
                    const orderedSizes = [
                        ...['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].filter(sz => allSizes.includes(sz)),
                        ...allSizes.filter(sz => !['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].includes(sz)).sort()
                    ];
                    html += `<tr class='collapse' id='${collapseId}'><td colspan='3' style='padding:0;'>
                                <table class='table table-sm mb-0'><tbody>`;
                    orderedSizes.forEach(size => {
                        const sizeStudents = sizeMap[size].students || [];
                        const sizeUniqueStudents = sizeStudents.length;
                        
                        // Create student dropdown for size
                        const sizeStudentDropdownId = `students_inprocess_${title.replace(/\s/g, '')}_${idx}_${size}`;
                        let sizeStudentDropdownHtml = '';
                        if (sizeStudents.length > 0) {
                            sizeStudentDropdownHtml = `<button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#${sizeStudentDropdownId}">
                                ${sizeUniqueStudents} student${sizeUniqueStudents > 1 ? 's' : ''} <i class="bi bi-caret-down-fill"></i>
                            </button>
                            <div class="collapse mt-2" id="${sizeStudentDropdownId}">
                                <div class="card card-body p-2">
                                    <table class="table table-sm mb-0">
                                        <thead><tr><th>Student</th><th>Qty</th><th>Status</th></tr></thead><tbody>`;
                            sizeStudents.forEach(student => {
                                const statusClass = student.paymentStatus === 'paid' ? 'text-success' : 
                                                  student.paymentStatus === 'unpaid' ? 'text-danger' : 'text-warning';
                                sizeStudentDropdownHtml += `<tr>
                                    <td>${student.studentName} (${student.studentNumber})</td>
                                    <td>${student.quantity}</td>
                                    <td class="${statusClass}">${student.paymentStatus}</td>
                                </tr>`;
                            });
                            sizeStudentDropdownHtml += `</tbody></table></div></div>`;
                        }
                        
                        html += `<tr><td style='padding-left:2em;'>${size}</td><td>${sizeMap[size].quantity}</td><td>${sizeStudentDropdownHtml}</td></tr>`;
                    });
                    html += `</tbody></table></td></tr>`;
                }
            } else {
                // Create student dropdown for non-t-shirt items
                const studentDropdownId = `students_inprocess_${title.replace(/\s/g, '')}_${idx}`;
                let studentDropdownHtml = '';
                if (itemStudents.length > 0) {
                    studentDropdownHtml = `<button class="btn btn-sm btn-outline-info" type="button" data-bs-toggle="collapse" data-bs-target="#${studentDropdownId}">
                        ${uniqueStudents} student${uniqueStudents > 1 ? 's' : ''} <i class="bi bi-caret-down-fill"></i>
                    </button>
                    <div class="collapse mt-2" id="${studentDropdownId}">
                        <div class="card card-body p-2">
                            <table class="table table-sm mb-0">
                                <thead><tr><th>Student</th><th>Qty</th><th>Status</th></tr></thead><tbody>`;
                    itemStudents.forEach(student => {
                        const statusClass = student.paymentStatus === 'paid' ? 'text-success' : 
                                          student.paymentStatus === 'unpaid' ? 'text-danger' : 'text-warning';
                        studentDropdownHtml += `<tr>
                            <td>${student.studentName} (${student.studentNumber})</td>
                            <td>${student.quantity}</td>
                            <td class="${statusClass}">${student.paymentStatus}</td>
                        </tr>`;
                    });
                    studentDropdownHtml += `</tbody></table></div></div>`;
                }
                
                html += `<tr><td>${item}</td><td>${summaryObj[item].quantity}</td><td>${studentDropdownHtml}</td></tr>`;
            }
        });
        html += '</tbody></table></div>';
        return html;
    }

    let html = '';
    html += buildTable('PAGLAOM', paglaomSummary, paglaomBaseItems);
    html += buildTable('ISKOLEHIYO', iskolehiyoSummary);
    summaryDiv.innerHTML = html;
}

function updateHistoryOrdersSummary() {
    const summaryDiv = document.getElementById('historyOrdersSummary');
    if (!summaryDiv) return;

    // Filter orders based on date range if set
    let filteredHistory = [...orderHistory];
    if (historyFilterStartDate || historyFilterEndDate) {
        filteredHistory = orderHistory.filter(order => {
            let claimDate = order.claimDate ? order.claimDate.split(' ')[0] : '';
            if (historyFilterStartDate && claimDate < historyFilterStartDate) return false;
            if (historyFilterEndDate && claimDate > historyFilterEndDate) return false;
            return true;
        });
    }

    // Group by item and division
    const paglaomSummary = {};
    const iskolehiyoSummary = {};

    // Define ISKOLEHIYO base items (case-insensitive, ignore size info)
    const iskolehiyoBaseItems = [
        'ISKOLEHIYO T-SHIRT V1.1',
        'ISKOLEHIYO T-SHIRT V1.2',
        'ISKOLEHIYO T-SHIRT V1.3',
        'ISKOLEHIYO TOTE BAG V1.1',
        'ISKOLEHIYO TOTE BAG V1.2',
        'AIRPLANE PIN',
        'REMOVE BEFORE FLIGHT TAG'
    ];

    // Define PAGLAOM base items (case-insensitive, ignore size info)
    const paglaomBaseItems = [
        'PAGLAOM V1.1 T-SHIRT',
        'PAGLAOM V1.2 T-SHIRT',
        'Hirono Airplane Sticker',
        'Hirono Computer Enthusiasts Sticker',
        'Hirono Uniform Sticker',
        'Sticker Set A',
        'Sticker Set B'
    ];

    // Helper to extract base name (removes size info in parentheses or after last space if it's a size)
    function getBaseName(itemName) {
        // Remove size in parentheses, e.g., (S), (M), (L), (XL), (XXL), etc.
        let base = itemName.replace(/\s*\([^)]*\)\s*$/, '');
        // Remove trailing size after space, e.g., 'PAGLAOM V1.1 T-SHIRT S'
        base = base.replace(/\s+(S|M|L|XL|XXL|XS|2XL|3XL|4XL)$/i, '');
        return base.trim();
    }

    filteredHistory.forEach(order => {
        // Split items if multiple in one order
        const items = order.itemName.split(',').map(i => i.trim()).filter(i => i);
        items.forEach(itemStr => {
            let itemMatch = itemStr.match(/^(.*?)(?:\s*\((\d+)x\))?$/);
            let rawName = itemMatch ? itemMatch[1].trim() : itemStr;
            let quantity = itemMatch && itemMatch[2] ? parseInt(itemMatch[2]) : (order.quantity || 1);
            let baseName = getBaseName(rawName);
            // Extract size (in parentheses or as trailing word)
            let size = null;
            let parenMatch = rawName.match(/\(([^)]+)\)/);
            if (parenMatch) {
                size = parenMatch[1].trim();
            } else {
                let trailing = rawName.match(/\b(S|M|L|XL|XXL|XS|2XL|3XL|4XL)\b$/i);
                if (trailing) size = trailing[1].toUpperCase();
            }

            // Create student info object
            const studentInfo = {
                studentNumber: order.studentNumber,
                studentName: order.studentName,
                quantity: quantity,
                paymentStatus: order.paymentStatus,
                timestamp: order.timestamp,
                claimDate: order.claimDate
            };

            // PAGLAOM base items always go to PAGLAOM
            if (paglaomBaseItems.some(b => b.toLowerCase() === baseName.toLowerCase())) {
                if (!paglaomSummary[baseName]) {
                    paglaomSummary[baseName] = { 
                        quantity: 0, 
                        sizes: {},
                        students: []
                    };
                }
                paglaomSummary[baseName].quantity += quantity;
                paglaomSummary[baseName].students.push(studentInfo);
                if (/t-shirt/i.test(baseName) && size) {
                    if (!paglaomSummary[baseName].sizes[size]) {
                        paglaomSummary[baseName].sizes[size] = { quantity: 0, students: [] };
                    }
                    paglaomSummary[baseName].sizes[size].quantity += quantity;
                    paglaomSummary[baseName].sizes[size].students.push(studentInfo);
                }
            } else if (iskolehiyoBaseItems.some(b => b.toLowerCase() === baseName.toLowerCase())) {
                if (!iskolehiyoSummary[baseName]) {
                    iskolehiyoSummary[baseName] = { 
                        quantity: 0, 
                        sizes: {},
                        students: []
                    };
                }
                iskolehiyoSummary[baseName].quantity += quantity;
                iskolehiyoSummary[baseName].students.push(studentInfo);
                if (/t-shirt/i.test(baseName) && size) {
                    if (!iskolehiyoSummary[baseName].sizes[size]) {
                        iskolehiyoSummary[baseName].sizes[size] = { quantity: 0, students: [] };
                    }
                    iskolehiyoSummary[baseName].sizes[size].quantity += quantity;
                    iskolehiyoSummary[baseName].sizes[size].students.push(studentInfo);
                }
            } else {
                if (!paglaomSummary[baseName]) {
                    paglaomSummary[baseName] = { 
                        quantity: 0,
                        students: []
                    };
                }
                paglaomSummary[baseName].quantity += quantity;
                paglaomSummary[baseName].students.push(studentInfo);
            }
        });
    });

    // Helper to build a summary table
    function buildTable(title, summaryObj, paglaomBaseOrder = []) {
        let html = `<h6 class='fw-bold mt-3 mb-2'>${title}</h6>`;
        html += '<div class="table-responsive"><table class="table table-sm table-bordered"><thead><tr><th>Item</th><th>Total Quantity</th><th>Students</th></tr></thead><tbody>';
        const items = Object.keys(summaryObj);
        let sortedItems;
        if (title === 'PAGLAOM' && paglaomBaseOrder.length > 0) {
            const baseOrdered = paglaomBaseOrder.filter(item => summaryObj[item]);
            const others = items.filter(item => !baseOrdered.includes(item)).sort();
            sortedItems = [...baseOrdered, ...others];
        } else {
            const tshirts = items.filter(item => /t-shirt/i.test(item)).sort();
            const totebags = items.filter(item => /tote bag/i.test(item)).sort();
            const others = items.filter(item => !tshirts.includes(item) && !totebags.includes(item)).sort();
            sortedItems = [...tshirts, ...totebags, ...others];
        }
        
        sortedItems.forEach((item, idx) => {
            const itemStudents = summaryObj[item].students || [];
            const uniqueStudents = itemStudents.length;
            
            if (/t-shirt/i.test(item)) {
                // Dropdown for T-SHIRT: show total, expandable to show sizes
                const collapseId = `${title.replace(/\s/g, '')}_history_tshirt_${idx}`;
                const sizeMap = summaryObj[item].sizes || {};
                const hasSizes = Object.keys(sizeMap).length > 0;
                
                // Create student dropdown for main item
                const studentDropdownId = `students_history_${title.replace(/\s/g, '')}_${idx}`;
                let studentDropdownHtml = '';
                if (itemStudents.length > 0) {
                    studentDropdownHtml = `<button class="btn btn-sm btn-outline-info" type="button" data-bs-toggle="collapse" data-bs-target="#${studentDropdownId}">
                        ${uniqueStudents} student${uniqueStudents > 1 ? 's' : ''} <i class="bi bi-caret-down-fill"></i>
                    </button>
                    <div class="collapse mt-2" id="${studentDropdownId}">
                        <div class="card card-body p-2">
                            <table class="table table-sm mb-0">
                                <thead><tr><th>Student</th><th>Qty</th><th>Status</th><th>Claim Date</th></tr></thead><tbody>`;
                    itemStudents.forEach(student => {
                        const statusClass = student.paymentStatus === 'paid' ? 'text-success' : 
                                          student.paymentStatus === 'unpaid' ? 'text-danger' : 'text-warning';
                        const claimDate = student.claimDate ? new Date(student.claimDate).toLocaleDateString() : '-';
                        studentDropdownHtml += `<tr>
                            <td>${student.studentName} (${student.studentNumber})</td>
                            <td>${student.quantity}</td>
                            <td class="${statusClass}">${student.paymentStatus}</td>
                            <td>${claimDate}</td>
                        </tr>`;
                    });
                    studentDropdownHtml += `</tbody></table></div></div>`;
                }
                
                html += `<tr data-bs-toggle='collapse' data-bs-target='#${collapseId}' style='cursor:pointer;'>
                            <td><b>${item}</b> <span class='ms-1'><i class='bi bi-caret-down-fill'></i></span></td>
                            <td><b>${summaryObj[item].quantity}</b></td>
                            <td>${studentDropdownHtml}</td>
                        </tr>`;
                if (hasSizes) {
                    // Order sizes as S, M, L, XL, 2XL, 3XL, 4XL, 5XL, then others
                    const allSizes = Object.keys(sizeMap);
                    const orderedSizes = [
                        ...['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].filter(sz => allSizes.includes(sz)),
                        ...allSizes.filter(sz => !['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].includes(sz)).sort()
                    ];
                    html += `<tr class='collapse' id='${collapseId}'><td colspan='3' style='padding:0;'>
                                <table class='table table-sm mb-0'><tbody>`;
                    orderedSizes.forEach(size => {
                        const sizeStudents = sizeMap[size].students || [];
                        const sizeUniqueStudents = sizeStudents.length;
                        
                        // Create student dropdown for size
                        const sizeStudentDropdownId = `students_history_${title.replace(/\s/g, '')}_${idx}_${size}`;
                        let sizeStudentDropdownHtml = '';
                        if (sizeStudents.length > 0) {
                            sizeStudentDropdownHtml = `<button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#${sizeStudentDropdownId}">
                                ${sizeUniqueStudents} student${sizeUniqueStudents > 1 ? 's' : ''} <i class="bi bi-caret-down-fill"></i>
                            </button>
                            <div class="collapse mt-2" id="${sizeStudentDropdownId}">
                                <div class="card card-body p-2">
                                    <table class="table table-sm mb-0">
                                        <thead><tr><th>Student</th><th>Qty</th><th>Status</th><th>Claim Date</th></tr></thead><tbody>`;
                            sizeStudents.forEach(student => {
                                const statusClass = student.paymentStatus === 'paid' ? 'text-success' : 
                                                  student.paymentStatus === 'unpaid' ? 'text-danger' : 'text-warning';
                                const claimDate = student.claimDate ? new Date(student.claimDate).toLocaleDateString() : '-';
                                sizeStudentDropdownHtml += `<tr>
                                    <td>${student.studentName} (${student.studentNumber})</td>
                                    <td>${student.quantity}</td>
                                    <td class="${statusClass}">${student.paymentStatus}</td>
                                    <td>${claimDate}</td>
                                </tr>`;
                            });
                            sizeStudentDropdownHtml += `</tbody></table></div></div>`;
                        }
                        
                        html += `<tr><td style='padding-left:2em;'>${size}</td><td>${sizeMap[size].quantity}</td><td>${sizeStudentDropdownHtml}</td></tr>`;
                    });
                    html += `</tbody></table></td></tr>`;
                }
            } else {
                // Create student dropdown for non-t-shirt items
                const studentDropdownId = `students_history_${title.replace(/\s/g, '')}_${idx}`;
                let studentDropdownHtml = '';
                if (itemStudents.length > 0) {
                    studentDropdownHtml = `<button class="btn btn-sm btn-outline-info" type="button" data-bs-toggle="collapse" data-bs-target="#${studentDropdownId}">
                        ${uniqueStudents} student${uniqueStudents > 1 ? 's' : ''} <i class="bi bi-caret-down-fill"></i>
                    </button>
                    <div class="collapse mt-2" id="${studentDropdownId}">
                        <div class="card card-body p-2">
                            <table class="table table-sm mb-0">
                                <thead><tr><th>Student</th><th>Qty</th><th>Status</th><th>Claim Date</th></tr></thead><tbody>`;
                    itemStudents.forEach(student => {
                        const statusClass = student.paymentStatus === 'paid' ? 'text-success' : 
                                          student.paymentStatus === 'unpaid' ? 'text-danger' : 'text-warning';
                        const claimDate = student.claimDate ? new Date(student.claimDate).toLocaleDateString() : '-';
                        studentDropdownHtml += `<tr>
                            <td>${student.studentName} (${student.studentNumber})</td>
                            <td>${student.quantity}</td>
                            <td class="${statusClass}">${student.paymentStatus}</td>
                            <td>${claimDate}</td>
                        </tr>`;
                    });
                    studentDropdownHtml += `</tbody></table></div></div>`;
                }
                
                html += `<tr><td>${item}</td><td>${summaryObj[item].quantity}</td><td>${studentDropdownHtml}</td></tr>`;
            }
        });
        html += '</tbody></table></div>';
        return html;
    }

    let html = '';
    html += buildTable('PAGLAOM', paglaomSummary, paglaomBaseItems);
    html += buildTable('ISKOLEHIYO', iskolehiyoSummary);
    summaryDiv.innerHTML = html;
}

function updateOrdersList() {
    updateOrdersSummary();
    updateInProcessSummary();
    updateHistoryOrdersSummary();
    const ordersList = document.getElementById('ordersList');
    const inProcessList = document.getElementById('inProcessList');
    const orderHistoryList = document.getElementById('orderHistoryList');
    const deletedOrdersList = document.getElementById('deletedOrdersList');
    if (ordersList) ordersList.innerHTML = '';
    if (inProcessList) inProcessList.innerHTML = '';
    if (orderHistoryList) orderHistoryList.innerHTML = '';
    if (deletedOrdersList) deletedOrdersList.innerHTML = '';
    
    // Filter out orders that are present in other sections
    const otherSectionKeys = {
        deleted: new Set(deletedOrders.map(order => `${order.studentNumber}_${order.timestamp}`)),
        inProcess: new Set(inProcessOrders.map(order => `${order.studentNumber}_${order.timestamp}`)),
        history: new Set(orderHistory.map(order => `${order.studentNumber}_${order.timestamp}`))
    };
    
    const visibleOrders = orders.filter(order => {
        const key = `${order.studentNumber}_${order.timestamp}`;
        return !otherSectionKeys.deleted.has(key) && 
               !otherSectionKeys.inProcess.has(key) && 
               !otherSectionKeys.history.has(key);
    });

    // First, group orders by student number to identify same students
    const studentGroups = {};
    visibleOrders.forEach(order => {
        if (!studentGroups[order.studentNumber]) {
            studentGroups[order.studentNumber] = [];
        }
        studentGroups[order.studentNumber].push(order);
    });

    // Group orders by date
    const dateGroups = {};
    visibleOrders.forEach(order => {
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
    if (ordersList) {
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
                        let quantity = itemMatch && itemMatch[2] ? parseInt(itemMatch[2]) : (order.quantity || 1);
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

                // Create the rows for perfect column alignment
                allItems.forEach((item, idx) => {
                    const row = document.createElement('tr');
                    let cells = '';
                    if (idx === 0) {
                        const orderNo = getOrderNumberByFormIndex(firstOrder.formIndex);
                        cells += `<td rowspan="${allItems.length}">${orderNo}</td>`;
                        cells += `<td rowspan="${allItems.length}">${firstOrder.studentNumber}</td>`;
                        cells += `<td rowspan="${allItems.length}">${firstOrder.studentName}</td>`;
                    }
                    cells += `<td>${item.itemName}</td>`;
                    cells += `<td>${item.quantity}</td>`;
                    if (idx === 0) {
                        // Show interest for half-paid status and paid status that had interest
                        let totalCell = '';
                        if (firstOrder.paymentStatus === 'half-paid' || (firstOrder.paymentStatus === 'paid' && firstOrder.hadInterest)) {
                            const interest = 10;
                            const base = total;
                            const sum = base + interest;
                            totalCell = `${base}+${interest}<br><strong>${formatCurrency(sum)}</strong>`;
                        } else {
                            totalCell = formatCurrency(total);
                        }
                        cells += `<td rowspan="${allItems.length}">${totalCell}</td>`;
                        cells += `<td rowspan="${allItems.length}">${firstOrder.gcashReference || '-'}</td>`;
                        cells += `<td rowspan="${allItems.length}">${firstOrder.paymentMode || '-'}</td>`;
                        cells += `<td rowspan="${allItems.length}">${displayTimestamp}</td>`;
                        cells += `<td rowspan="${allItems.length}">
                            <span class="badge ${firstOrder.paymentStatus === 'paid' ? 'bg-success' : (firstOrder.paymentStatus === 'half-paid' ? 'bg-warning' : 'bg-secondary')} clickable" style="cursor:pointer;" onclick="openChangePaymentStatusModal('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">
                                ${firstOrder.paymentStatus.charAt(0).toUpperCase() + firstOrder.paymentStatus.slice(1).replace('-', ' ')}
                            </span>
                        </td>`;
                        cells += `<td rowspan="${allItems.length}">
                            <div class="btn-group">
                                <button class="btn btn-sm btn-primary" onclick="openProcessConfirmModal('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">
                                    <i class="bi bi-arrow-right-circle"></i>
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="deleteOrderFromOrders('${firstOrder.studentNumber}', '${firstOrder.timestamp}')" title="Delete Order">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </td>`;
                    }
                    row.innerHTML = cells;
                    ordersList.appendChild(row);
                });
            });
        });
    }

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
    if (inProcessList) {
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
                    const orderNo = getOrderNumberByFormIndex(firstOrder.formIndex);
                    cells += `<td rowspan="${allItems.length}">${orderNo}</td>`;
                    cells += `<td rowspan="${allItems.length}">${firstOrder.studentNumber}</td>`;
                    cells += `<td rowspan="${allItems.length}">${firstOrder.studentName}</td>`;
                    // Email Show/Hide button
                    const emailId = `email-cell-${firstOrder.studentNumber.replace(/[^a-zA-Z0-9]/g, '')}-${firstOrder.timestamp.replace(/[^a-zA-Z0-9]/g, '')}`;
                    cells += `<td rowspan="${allItems.length}"><button class='btn btn-sm btn-outline-primary' type='button' onclick="toggleEmailVisibility('${emailId}', '${firstOrder.email || '-'}', this)">Show</button><span id='${emailId}' style='display:none; margin-left:8px;'></span></td>`;
                }
                cells += `<td>${item.itemName}</td>`;
                cells += `<td>${item.quantity}</td>`;
                if (idx === 0) {
                    // Show interest for half-paid status and paid status that came from half-paid
                    let totalCell = '';
                    if (firstOrder.paymentStatus === 'half-paid' || (firstOrder.paymentStatus === 'paid' && firstOrder.hadInterest)) {
                        const interest = 10;
                        const base = total;
                        const sum = base + interest;
                        totalCell = `${base}+${interest}<br><strong>${formatCurrency(sum)}</strong>`;
                    } else {
                        totalCell = formatCurrency(total);
                    }
                    cells += `<td rowspan="${allItems.length}">${totalCell}</td>`;
                    cells += `<td rowspan="${allItems.length}">${firstOrder.gcashReference || '-'}</td>`;
                    cells += `<td rowspan="${allItems.length}">${firstOrder.paymentMode || '-'}</td>`;
                    cells += `<td rowspan="${allItems.length}">${displayTimestamp}</td>`;
                    let statusClass = firstOrder.paymentStatus === 'paid' ? 'bg-success' : (firstOrder.paymentStatus === 'half-paid' ? 'bg-warning' : 'bg-secondary');
                    let statusContent = `<span class="badge ${statusClass} clickable" style="cursor:pointer;" onclick="openChangePaymentStatusModal('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">${firstOrder.paymentStatus.charAt(0).toUpperCase() + firstOrder.paymentStatus.slice(1).replace('-', ' ')}</span>`;
                    cells += `<td rowspan="${allItems.length}">${statusContent}</td>`;
                    cells += `<td rowspan="${allItems.length}" class="action-buttons">
                        <button class="btn btn-sm btn-success" onclick="markAsComplete('${firstOrder.studentNumber}', '${firstOrder.timestamp}')"${firstOrder.paymentStatus === 'unpaid' || firstOrder.paymentStatus === 'half-paid' ? ' disabled title=\"Must be fully paid before claiming\"' : ''}>
                            <i class="bi bi-check-circle"></i> Claim
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="openRevertConfirmModal('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">
                            <i class="bi bi-arrow-left-circle"></i> Revert
                        </button>
                        ${firstOrder.notified ?
                            `<button class="btn btn-sm btn-success" onclick="openNotifyBuyerModal('${firstOrder.studentNumber}', '${firstOrder.timestamp}', true)" title="Notify Again">Notified</button>` :
                            `<button class="btn btn-sm btn-warning" onclick="openNotifyBuyerModal('${firstOrder.studentNumber}', '${firstOrder.timestamp}')" title="Notify Buyer">Notify</button>`
                        }
                    </td>`;
                }
                row.innerHTML = cells;
                inProcessList.appendChild(row);
            });
        });
    }

    // Update Order History list
    if (orderHistoryList) {
        // Group orderHistory by date
        const dateGroups = {};
        orderHistory.forEach(order => {
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
            const parseDate = (str) => new Date(str);
            return parseDate(b) - parseDate(a);
        });
        sortedDates.forEach(date => {
            const dateOrders = dateGroups[date];
            // Add date header
            const dateHeader = document.createElement('tr');
            dateHeader.className = 'date-header';
            dateHeader.innerHTML = `<td colspan="13" class="bg-light fw-bold">${date}</td>`;
            orderHistoryList.appendChild(dateHeader);
            // Group by student number and timestamp within each date
            let grouped = {};
            dateOrders.forEach(order => {
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
            orderKeys.forEach((key, groupIdx) => {
                const group = grouped[key];
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
                        let quantity = itemMatch && itemMatch[2] ? parseInt(itemMatch[2]) : (order.quantity || 1);
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
                        const orderNo = getOrderNumberByFormIndex(firstOrder.formIndex);
                        cells += `<td rowspan="${allItems.length}">${orderNo}</td>`;
                        cells += `<td rowspan="${allItems.length}">${firstOrder.studentNumber}</td>`;
                        cells += `<td rowspan="${allItems.length}">${firstOrder.studentName}</td>`;
                    }
                    cells += `<td>${item.itemName}</td>`;
                    cells += `<td>${item.quantity}</td>`;
                    if (idx === 0) {
                        // Show interest in history if the order had it
                        let totalCell = '';
                        if (firstOrder.hadInterest) {
                            const interest = 10;
                            const base = total;
                            const sum = base + interest;
                            totalCell = `${base}+${interest}<br><strong>${formatCurrency(sum)}</strong>`;
                        } else {
                            totalCell = formatCurrency(total);
                        }
                        cells += `<td rowspan="${allItems.length}">${totalCell}</td>`;
                        cells += `<td rowspan="${allItems.length}">${firstOrder.gcashReference || '-'}</td>`;
                        cells += `<td rowspan="${allItems.length}">${firstOrder.paymentMode || '-'}</td>`;
                        cells += `<td rowspan="${allItems.length}">${displayTimestamp}</td>`;
                        cells += `<td rowspan="${allItems.length}"><span class="payment-status ${firstOrder.paymentStatus}">${firstOrder.paymentStatus.charAt(0).toUpperCase() + firstOrder.paymentStatus.slice(1)}</span></td>`;
                        cells += `<td rowspan="${allItems.length}">${firstOrder.claimDate || '-'}</td>`;
                        cells += `<td rowspan="${allItems.length}" class="action-buttons">
                            <button class="btn btn-sm btn-danger" onclick="deleteHistoryOrder('${firstOrder.studentNumber}', '${firstOrder.timestamp}')">
                                <i class="bi bi-trash"></i> Delete
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="openRevertConfirmModal('${firstOrder.studentNumber}', '${firstOrder.timestamp}', true)"><i class='bi bi-arrow-left-circle'></i> Revert</button>
                        </td>`;
                    }
                    row.innerHTML = cells;
                    orderHistoryList.appendChild(row);
                });
            });
        });
    }

    // Render Deleted Orders
    if (deletedOrdersList) {
        // Instead of grouping by student number and timestamp, just sort and render each deleted order individually
        let sortedDeleted = [...deletedOrders];
        // Sort by timestamp (newest first)
        sortedDeleted.sort((a, b) => {
            const aDate = new Date(a.timestamp);
            const bDate = new Date(b.timestamp);
            return bDate - aDate;
        });
        sortedDeleted.forEach((order) => {
            // Collect all items for this order
            const items = order.itemName.split(',').map(i => i.trim()).filter(i => i);
            items.forEach((itemStr, idx) => {
                let itemMatch = itemStr.match(/^(.*?)(?:\s*\((\d+)x\))?$/);
                let itemName = itemMatch ? itemMatch[1].trim() : itemStr;
                let quantity = itemMatch && itemMatch[2] ? parseInt(itemMatch[2]) : 1;
                const row = document.createElement('tr');
                let cells = '';
                if (idx === 0) {
                    const orderNo = getOrderNumberByFormIndex(order.formIndex);
                    cells += `<td rowspan="${items.length}">${orderNo}</td>`;
                    cells += `<td rowspan="${items.length}">${order.studentNumber}</td>`;
                    cells += `<td rowspan="${items.length}">${order.studentName}</td>`;
                }
                cells += `<td>${itemName}</td>`;
                cells += `<td>${quantity}</td>`;
                if (idx === 0) {
                    cells += `<td rowspan="${items.length}">${formatCurrency(order.price)}</td>`;
                    cells += `<td rowspan="${items.length}">${order.gcashReference || '-'}</td>`;
                    cells += `<td rowspan="${items.length}">${order.paymentMode || '-'}</td>`;
                    // Show full timestamp
                    cells += `<td rowspan="${items.length}">${order.timestamp}</td>`;
                    cells += `<td rowspan="${items.length}"><span class="payment-status ${order.paymentStatus}">${order.paymentStatus.charAt(0).toUpperCase() + order.paymentStatus.slice(1)}</span></td>`;
                    cells += `<td rowspan="${items.length}">${order.claimDate || '-'}</td>`;
                    // Add revert button
                    cells += `<td rowspan="${items.length}"><button class='btn btn-sm btn-secondary' onclick="openDeletedRevertConfirmModal('${order.studentNumber}', '${order.timestamp}')"><i class='bi bi-arrow-left-circle'></i> Revert</button></td>`;
                }
                row.innerHTML = cells;
                deletedOrdersList.appendChild(row);
            });
        });
    }
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
            // When going from unpaid to paid directly, no interest should be added
            order.paymentStatus = 'paid';
            order.hadInterest = false;
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
        // Keep the original payment status
        inProcessOrders.push(orderToMove);
        orders = orders.filter(order => 
            !(order.studentNumber === studentNumber && order.timestamp === timestamp)
        );
        saveOrders();
        updateOrdersList();
        showNotification('Order moved to In-Process', 'success');
    }
}

function openClaimConfirmModal(studentNumber, timestamp) {
    pendingClaimStudentNumber = studentNumber;
    pendingClaimTimestamp = timestamp;
    document.getElementById('claimConfirmInput').value = '';
    document.getElementById('claimConfirmInvalid').style.display = 'none';
    const modal = new bootstrap.Modal(document.getElementById('claimConfirmModal'));
    modal.show();
}

// Update the markAsComplete function to use the confirmation modal
function markAsComplete(studentNumber, timestamp) {
    openClaimConfirmModal(studentNumber, timestamp);
}

// Add event listener for claim confirm button
const claimConfirmBtn = document.getElementById('claimConfirmBtn');
if (claimConfirmBtn) {
    claimConfirmBtn.addEventListener('click', function() {
        const input = document.getElementById('claimConfirmInput').value.trim();
        const invalidFeedback = document.getElementById('claimConfirmInvalid');
        if (input !== 'Claim') {
            invalidFeedback.style.display = 'block';
            return;
        }
        invalidFeedback.style.display = 'none';
        // Hide modal
        const modalEl = document.getElementById('claimConfirmModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();

        // Process the claim
        if (pendingClaimStudentNumber && pendingClaimTimestamp) {
            const order = inProcessOrders.find(order => 
                order.studentNumber === pendingClaimStudentNumber && order.timestamp === pendingClaimTimestamp
            );
            if (order) {
                // Add claim date to the order
                const now = new Date();
                order.claimDate = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
                // Keep the hadInterest flag as is when moving to history
                const orderForHistory = {...order};  // Create a copy to preserve all properties
                orderHistory.push(orderForHistory);
                inProcessOrders = inProcessOrders.filter(order => 
                    !(order.studentNumber === pendingClaimStudentNumber && order.timestamp === pendingClaimTimestamp)
                );
                saveOrders();
                updateOrdersList();
                showNotification('Order marked as claimed and moved to history', 'success');
            }
        }
        pendingClaimStudentNumber = null;
        pendingClaimTimestamp = null;
    });

    // Allow pressing Enter in the input to trigger the button
    const claimConfirmInput = document.getElementById('claimConfirmInput');
    if (claimConfirmInput) {
        claimConfirmInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                claimConfirmBtn.click();
            }
        });
    }
}

// Revert order back to Orders list
function revertToOrders(studentNumber, timestamp) {
    const orderToMove = inProcessOrders.find(order => 
        order.studentNumber === studentNumber && order.timestamp === timestamp
    );
    
    if (orderToMove) {
        // Always revert paymentStatus to 'unpaid' when moving back to Orders
        orderToMove.paymentStatus = 'unpaid';
        orders.push(orderToMove);
        inProcessOrders = inProcessOrders.filter(order => 
            !(order.studentNumber === studentNumber && order.timestamp === timestamp)
        );
        saveOrders();
        updateOrdersList();
        showNotification('Order reverted back to Orders list', 'info');
    }
}

// Add a new function to handle revert from order history
function revertHistoryOrderToInProcess(studentNumber, timestamp) {
    const idx = orderHistory.findIndex(order => order.studentNumber === studentNumber && order.timestamp === timestamp);
    if (idx !== -1) {
        const [order] = orderHistory.splice(idx, 1);
        // Keep the original payment status and interest state
        if (order.hadInterest) {
            order.paymentStatus = 'paid';  // If it had interest, it must have been paid
        } else {
            order.paymentStatus = 'paid';  // If no interest, keep it as paid without interest
            order.hadInterest = false;  // Ensure hadInterest remains false
        }
        inProcessOrders.push(order);
        saveOrders();
        updateOrdersList();
        showNotification('Order reverted to In-Process section.', 'info');
    }
}

function openDeleteConfirmModal(studentNumber, timestamp) {
    pendingDeleteStudentNumber = studentNumber;
    pendingDeleteTimestamp = timestamp;
    document.getElementById('deleteConfirmInput').value = '';
    document.getElementById('deleteConfirmInvalid').style.display = 'none';
    const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    modal.show();
}

function deleteHistoryOrder(studentNumber, timestamp) {
    // Use modal instead of prompt
    openDeleteConfirmModal(studentNumber, timestamp);
}

// Modal Delete button handler
const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', function() {
        const input = document.getElementById('deleteConfirmInput').value.trim();
        const invalidFeedback = document.getElementById('deleteConfirmInvalid');
        if (input !== 'Delete') {
            invalidFeedback.style.display = 'block';
            return;
        }
        invalidFeedback.style.display = 'none';
        // Hide modal
        const modalEl = document.getElementById('deleteConfirmModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
        if (pendingDeleteStudentNumber && pendingDeleteTimestamp) {
            let deleted = orderHistory.filter(order => order.studentNumber === pendingDeleteStudentNumber && order.timestamp === pendingDeleteTimestamp);
            if (deleted.length === 0) {
                deleted = orders.filter(order => order.studentNumber === pendingDeleteStudentNumber && order.timestamp === pendingDeleteTimestamp);
                orders = orders.filter(order => !(order.studentNumber === pendingDeleteStudentNumber && order.timestamp === pendingDeleteTimestamp));
            } else {
                orderHistory = orderHistory.filter(order => !(order.studentNumber === pendingDeleteStudentNumber && order.timestamp === pendingDeleteTimestamp));
            }
            deletedOrders = deletedOrders.concat(deleted);
            saveOrders();
            updateOrdersList();
            showNotification('Order moved to Deleted.', 'info');
        }
        pendingDeleteStudentNumber = null;
        pendingDeleteTimestamp = null;
    });
    // Allow pressing Enter in the input to trigger the delete button
    const deleteConfirmInput = document.getElementById('deleteConfirmInput');
    if (deleteConfirmInput) {
        deleteConfirmInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                deleteConfirmBtn.click();
            }
        });
    }
}

// Add the deleteOrderFromOrders function to handle deleting from orders (move to deletedOrders with confirmation)
function deleteOrderFromOrders(studentNumber, timestamp) {
    pendingDeleteStudentNumber = studentNumber;
    pendingDeleteTimestamp = timestamp;
    document.getElementById('deleteConfirmInput').value = '';
    document.getElementById('deleteConfirmInvalid').style.display = 'none';
    const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    modal.show();
    // On confirm, move from orders to deletedOrders
    // The existing modal handler will handle the move, but we need to check both orders and orderHistory
    // So, in the modal handler, update the logic:
    // Instead of only moving from orderHistory, also check orders
}

// Add the revertDeletedOrder function
function revertDeletedOrder(studentNumber, timestamp) {
    // Find the order in deletedOrders
    const idx = deletedOrders.findIndex(order => order.studentNumber === studentNumber && order.timestamp === timestamp);
    if (idx !== -1) {
        const [order] = deletedOrders.splice(idx, 1);
        // Always revert paymentStatus to 'unpaid' when restoring from Deleted
        order.paymentStatus = 'unpaid';
        saveOrders(); // Save after removing from deletedOrders, so deletedKeys is updated
        orders.push(order);
        saveOrders();
        updateOrdersList();
        showNotification('Order reverted back to Orders section.', 'info');
    }
}

// Initialize the form submission handler
const orderForm = document.getElementById('orderForm');
if (orderForm) {
    orderForm.addEventListener('submit', addOrder);
}
// Add sync button handler
document.addEventListener('DOMContentLoaded', function() {
    const syncButton = document.getElementById('syncButton');
    if (syncButton) {
        syncButton.addEventListener('click', fetchFromGoogleSheets);
    }
});

// Export All Orders to Excel
function exportAllOrdersToExcel() {
    if (!orders.length && !inProcessOrders.length && !orderHistory.length && !deletedOrders.length) {
        showNotification('No orders to export.', 'warning');
        return;
    }

    // Get current date in YYYY-MM-DD format
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;

    // Create workbook with four sheets
    const wb = XLSX.utils.book_new();

    // Export Orders
    const ordersData = prepareOrdersForExport(orders, false);
    const wsOrders = XLSX.utils.json_to_sheet(ordersData);
    formatWorksheet(wsOrders, ordersData);
    XLSX.utils.book_append_sheet(wb, wsOrders, 'Orders');

    // Export In-Process Orders
    const inProcessData = prepareOrdersForExport(inProcessOrders, false);
    const wsInProcess = XLSX.utils.json_to_sheet(inProcessData);
    formatWorksheet(wsInProcess, inProcessData);
    XLSX.utils.book_append_sheet(wb, wsInProcess, 'In-Process Orders');

    // Export Order History
    const historyData = prepareOrdersForExport(orderHistory, true);
    const wsHistory = XLSX.utils.json_to_sheet(historyData);
    formatWorksheet(wsHistory, historyData);
    XLSX.utils.book_append_sheet(wb, wsHistory, 'Order History');

    // Export Deleted Orders
    const deletedData = prepareOrdersForExport(deletedOrders, true);
    const wsDeleted = XLSX.utils.json_to_sheet(deletedData);
    formatWorksheet(wsDeleted, deletedData);
    XLSX.utils.book_append_sheet(wb, wsDeleted, 'Deleted Orders');

    // Export to file with date in filename
    XLSX.writeFile(wb, `MerchTracker_All_Orders_${dateStr}.xlsx`);
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
            const rowData = {};
            if (idx === 0 && firstOrder.formIndex) {
                rowData['Order No.'] = firstOrder.formIndex.toString().padStart(4, '0');
            } else if (idx === 0) {
                rowData['Order No.'] = '';
            }
            rowData['Student Number'] = idx === 0 ? firstOrder.studentNumber : '';
            rowData['Student Name'] = idx === 0 ? firstOrder.studentName : '';
            rowData['Email'] = idx === 0 ? (firstOrder.email || '') : '';
            rowData['Item'] = item.itemName;
            rowData['Quantity'] = item.quantity;
            rowData['Total'] = idx === 0 && firstOrder.price !== '' ? `₱${firstOrder.price.toFixed(2)}` : '';
            rowData['GCash Reference Number'] = idx === 0 ? (firstOrder.gcashReference || '-') : '';
            rowData['Payment Mode'] = idx === 0 ? (firstOrder.paymentMode || '-') : '';
            rowData['Timestamp'] = idx === 0 ? firstOrder.timestamp : '';
            rowData['Payment Status'] = idx === 0 ? firstOrder.paymentStatus : '';
            rowData['Notified'] = idx === 0 ? (firstOrder.notified ? 'Yes' : 'No') : '';
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

            // Track if any section was imported and if any changes were made
            let importedAny = false;
            let changesMade = false;
            
            // Store original data to compare for changes
            const originalOrders = JSON.parse(JSON.stringify(orders));
            const originalInProcessOrders = JSON.parse(JSON.stringify(inProcessOrders));
            const originalOrderHistory = JSON.parse(JSON.stringify(orderHistory));
            const originalDeletedOrders = JSON.parse(JSON.stringify(deletedOrders));

            // Helper to process a sheet into an array of orders
            function processSheet(jsonData, isHistory) {
                const importedOrders = [];
                let currentOrder = null;
                let currentItems = [];
                
                jsonData.forEach(row => {
                    if (row['Student Number']) {
                        if (currentOrder) {
                            // Combine all items for the current order
                            currentOrder.itemName = currentItems.map(item => 
                                item.quantity > 1 ? `${item.name} (${item.quantity}x)` : item.name
                            ).join(', ');
                            importedOrders.push(currentOrder);
                        }
                        
                        // Start a new order
                        currentOrder = {
                            studentNumber: row['Student Number'] || '',
                            studentName: row['Student Name'] || '',
                            email: row['Email'] === '-' ? '' : (row['Email'] || ''),
                            itemName: '', // Will be set after processing all items
                            quantity: 1, // Default quantity as per original structure
                            price: row['Total'] ? parseFloat(String(row['Total']).replace('₱', '').replace(',', '')) || 0 : 0,
                            gcashReference: row['GCash Reference Number'] === '-' ? '' : (row['GCash Reference Number'] || ''),
                            paymentMode: row['Payment Mode'] === '-' ? '' : (row['Payment Mode'] || ''),
                            timestamp: row['Timestamp'] || '',
                            paymentStatus: row['Payment Status'] ? row['Payment Status'].toLowerCase() : '',
                            date: row['Timestamp'] || ''
                        };
                        
                        // Reset items array for new order
                        currentItems = [];
                        if (row['Item']) {
                            currentItems.push({
                                name: row['Item'] || '',
                                quantity: parseInt(row['Quantity']) || 1
                            });
                        }
                        
                        if (isHistory && row['Claim Date'] && row['Claim Date'] !== '-') {
                            currentOrder.claimDate = row['Claim Date'];
                        }
                        if (row['Order No.']) {
                            currentOrder.formIndex = parseInt(row['Order No.'], 10);
                        }
                        if (row['Notified']) {
                            currentOrder.notified = row['Notified'].toString().toLowerCase() === 'yes';
                        }
                        normalizePaymentStatus(currentOrder);
                    } else if (currentOrder && row['Item']) {
                        // Add additional item to current order
                        currentItems.push({
                            name: row['Item'] || '',
                            quantity: parseInt(row['Quantity']) || 1
                        });
                    }
                });
                
                if (currentOrder) {
                    // Combine all items for the last order
                    currentOrder.itemName = currentItems.map(item => 
                        item.quantity > 1 ? `${item.name} (${item.quantity}x)` : item.name
                    ).join(', ');
                    importedOrders.push(currentOrder);
                }
                
                return importedOrders;
            }

            // Validate that the file has the expected format
            const expectedColumns = ['Order No.', 'Student Number', 'Student Name', 'Email', 'Item', 'Quantity', 'Total', 'GCash Reference Number', 'Payment Mode', 'Timestamp', 'Payment Status', 'Notified'];
            
            // Process each sheet
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet);
                if (!jsonData.length) return;
                
                // Validate column headers for the first row
                const firstRow = jsonData[0];
                const hasRequiredColumns = expectedColumns.every(col => firstRow.hasOwnProperty(col));
                if (!hasRequiredColumns) {
                    console.warn(`Sheet "${sheetName}" does not have the expected column format. Skipping...`);
                    return;
                }

                            // Helper function to check if an order exists in any section
            function orderExistsInSection(order, section) {
                return section.some(existingOrder => 
                    existingOrder.studentNumber === order.studentNumber && 
                    existingOrder.timestamp === order.timestamp
                );
            }
            
            // Helper function to check if arrays are different
            function arraysAreDifferent(arr1, arr2) {
                if (arr1.length !== arr2.length) return true;
                return arr1.some((item, index) => JSON.stringify(item) !== JSON.stringify(arr2[index]));
            }

                if (sheetName.toLowerCase() === 'orders') {
                    const processedOrders = processSheet(jsonData, false);
                    // Filter out orders that exist in other sections
                    const newOrders = processedOrders.filter(order => 
                        !orderExistsInSection(order, inProcessOrders) &&
                        !orderExistsInSection(order, orderHistory) &&
                        !orderExistsInSection(order, deletedOrders)
                    );
                    if (arraysAreDifferent(orders, newOrders)) {
                        orders = newOrders;
                        changesMade = true;
                    }
                    importedAny = true;
                } else if (sheetName.toLowerCase() === 'in-process orders') {
                    const newInProcessOrders = processSheet(jsonData, false);
                    if (arraysAreDifferent(inProcessOrders, newInProcessOrders)) {
                        inProcessOrders = newInProcessOrders;
                        changesMade = true;
                    }
                    importedAny = true;
                } else if (sheetName.toLowerCase() === 'order history') {
                    const newOrderHistory = processSheet(jsonData, true);
                    if (arraysAreDifferent(orderHistory, newOrderHistory)) {
                        orderHistory = newOrderHistory;
                        changesMade = true;
                    }
                    importedAny = true;
                } else if (sheetName.toLowerCase() === 'deleted orders') {
                    const newDeletedOrders = processSheet(jsonData, true);
                    if (arraysAreDifferent(deletedOrders, newDeletedOrders)) {
                        deletedOrders = newDeletedOrders;
                        changesMade = true;
                    }
                    importedAny = true;
                }
            });

            if (!importedAny) {
                showNotification('No recognized sheets (Orders, In-Process Orders, Order History, Deleted Orders) found in file. Please ensure the Excel file was exported from this application.', 'warning');
                return;
            }

            if (changesMade) {
                saveOrders();
                updateOrdersList();
                showNotification('Successfully imported all orders and updated all sections.', 'success');
            } else {
                showNotification('No changes were made. The imported data is identical to the current data.', 'info');
            }
            
            // Clear the file input to allow re-importing the same file
            event.target.value = '';
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

function openNotifyBuyerModal(studentNumber, timestamp, isAgain = false) {
    pendingNotifyStudentNumber = studentNumber;
    pendingNotifyTimestamp = timestamp;
    document.getElementById('notifyBuyerInput').value = '';
    document.getElementById('notifyBuyerInvalid').style.display = 'none';
    // Prefill recipient email
    const findOrder = arr => arr.find(o => o.studentNumber === studentNumber && o.timestamp === timestamp);
    const order = findOrder(orders) || findOrder(inProcessOrders) || findOrder(orderHistory) || findOrder(deletedOrders);
    document.getElementById('notifyBuyerEmail').value = order && order.email ? order.email : '';
    document.getElementById('notifyBuyerEmailInvalid').style.display = 'none';
    // Change modal prompt if isAgain
    const prompt = document.querySelector('#notifyBuyerModal .modal-body p');
    if (isAgain) {
        prompt.innerHTML = "Type <strong>'Notify Again'</strong> to notify the buyer again:";
        document.getElementById('notifyBuyerBtn').textContent = 'Notify Again';
        document.getElementById('notifyBuyerBtn').dataset.notifyAgain = 'true';
    } else {
        prompt.innerHTML = "Type <strong>'Notify Buyer'</strong> to proceed with notifying the buyer:";
        document.getElementById('notifyBuyerBtn').textContent = 'Notify';
        document.getElementById('notifyBuyerBtn').dataset.notifyAgain = '';
    }
    const modal = new bootstrap.Modal(document.getElementById('notifyBuyerModal'));
    modal.show();
}
const notifyBuyerBtn = document.getElementById('notifyBuyerBtn');
if (notifyBuyerBtn) {
    notifyBuyerBtn.addEventListener('click', function() {
        const input = document.getElementById('notifyBuyerInput').value.trim();
        const invalidFeedback = document.getElementById('notifyBuyerInvalid');
        const emailInput = document.getElementById('notifyBuyerEmail').value.trim();
        const emailInvalid = document.getElementById('notifyBuyerEmailInvalid');
        let valid = true;
        const isAgain = notifyBuyerBtn.dataset.notifyAgain === 'true';
        if ((isAgain && input !== 'Notify Again') || (!isAgain && input !== 'Notify Buyer')) {
            invalidFeedback.style.display = 'block';
            valid = false;
        } else {
            invalidFeedback.style.display = 'none';
        }
        if (!emailInput || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
            emailInvalid.style.display = 'block';
            valid = false;
        } else {
            emailInvalid.style.display = 'none';
        }
        if (!valid) return;
        // Find the order object using the pending student number and timestamp
        const findOrder = arr => arr.find(o => o.studentNumber === pendingNotifyStudentNumber && o.timestamp === pendingNotifyTimestamp);
        const order = findOrder(orders) || findOrder(inProcessOrders) || findOrder(orderHistory) || findOrder(deletedOrders);
        const orderNo = order && order.formIndex ? order.formIndex.toString().padStart(4, '0') : '';
        const studentNumber = order ? order.studentNumber : '';
        const studentName = order ? order.studentName : '';
        // Submit Google Form programmatically, including email
        const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSdWGI6K4CHr0nmj5Yh40RfTlCF2yoeTE8wevqjC_Ig734knxw/formResponse";
        const formData = new FormData();
        formData.append("entry.707619360", orderNo);
        formData.append("entry.1190463898", studentNumber);
        formData.append("entry.1573165382", studentName);
        formData.append("entry.2005843144", emailInput); // <-- Replace with your actual Email entry ID
        fetch(formUrl, {
            method: "POST",
            mode: "no-cors",
            body: formData
        }).then(() => {
            markOrderAsNotified(studentNumber, order.timestamp);
            updateOrdersList();
            showNotification("Order notification submitted!", "success");
        }).catch((err) => {
            showNotification("Failed to submit notification: " + err, "danger");
        });
        // Hide modal
        const modalEl = document.getElementById('notifyBuyerModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
        pendingNotifyStudentNumber = null;
        pendingNotifyTimestamp = null;
    });
    // Allow pressing Enter in the input to trigger the notify button
    const notifyBuyerInput = document.getElementById('notifyBuyerInput');
    if (notifyBuyerInput) {
        notifyBuyerInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                notifyBuyerBtn.click();
            }
        });
    }
} 

let pendingRevertStudentNumber = null;
let pendingRevertTimestamp = null;
let pendingRevertIsHistory = false;
function openRevertConfirmModal(studentNumber, timestamp, isHistory = false) {
    pendingRevertStudentNumber = studentNumber;
    pendingRevertTimestamp = timestamp;
    pendingRevertIsHistory = isHistory;
    document.getElementById('revertConfirmInput').value = '';
    document.getElementById('revertConfirmInvalid').style.display = 'none';
    const modal = new bootstrap.Modal(document.getElementById('revertConfirmModal'));
    modal.show();
}
const revertConfirmBtn = document.getElementById('revertConfirmBtn');
if (revertConfirmBtn) {
    revertConfirmBtn.addEventListener('click', function() {
        const input = document.getElementById('revertConfirmInput').value.trim();
        const invalidFeedback = document.getElementById('revertConfirmInvalid');
        if (input !== 'Revert') {
            invalidFeedback.style.display = 'block';
            return;
        }
        invalidFeedback.style.display = 'none';
        // Hide modal
        const modalEl = document.getElementById('revertConfirmModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
        // Actually revert the order
        if (pendingRevertStudentNumber && pendingRevertTimestamp) {
            if (pendingRevertIsHistory) {
                revertHistoryOrderToInProcess(pendingRevertStudentNumber, pendingRevertTimestamp);
            } else {
                revertToOrders(pendingRevertStudentNumber, pendingRevertTimestamp);
            }
        }
        pendingRevertStudentNumber = null;
        pendingRevertTimestamp = null;
        pendingRevertIsHistory = false;
    });
    // Allow pressing Enter in the input to trigger the OK button
    const revertConfirmInput = document.getElementById('revertConfirmInput');
    if (revertConfirmInput) {
        revertConfirmInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                revertConfirmBtn.click();
            }
        });
    }
} 

let pendingPaidStudentNumber = null;
let pendingPaidTimestamp = null;
function openPaidConfirmModal(studentNumber, timestamp) {
    pendingPaidStudentNumber = studentNumber;
    pendingPaidTimestamp = timestamp;
    document.getElementById('paidConfirmInput').value = '';
    document.getElementById('paidConfirmInvalid').style.display = 'none';
    const modal = new bootstrap.Modal(document.getElementById('paidConfirmModal'));
    modal.show();
}
const paidConfirmBtn = document.getElementById('paidConfirmBtn');
if (paidConfirmBtn) {
    paidConfirmBtn.addEventListener('click', function() {
        const input = document.getElementById('paidConfirmInput').value.trim();
        const invalidFeedback = document.getElementById('paidConfirmInvalid');
        if (input !== 'Paid') {
            invalidFeedback.style.display = 'block';
            return;
        }
        invalidFeedback.style.display = 'none';
        // Hide modal
        const modalEl = document.getElementById('paidConfirmModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
        // Actually mark as paid
        if (pendingPaidStudentNumber && pendingPaidTimestamp) {
            markAllPaid(pendingPaidStudentNumber, pendingPaidTimestamp);
        }
        pendingPaidStudentNumber = null;
        pendingPaidTimestamp = null;
    });
    // Allow pressing Enter in the input to trigger the OK button
    const paidConfirmInput = document.getElementById('paidConfirmInput');
    if (paidConfirmInput) {
        paidConfirmInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                paidConfirmBtn.click();
            }
        });
    }
} 

let pendingProcessStudentNumber = null;
let pendingProcessTimestamp = null;
function openProcessConfirmModal(studentNumber, timestamp) {
    pendingProcessStudentNumber = studentNumber;
    pendingProcessTimestamp = timestamp;
    document.getElementById('processConfirmInput').value = '';
    document.getElementById('processConfirmInvalid').style.display = 'none';
    const modal = new bootstrap.Modal(document.getElementById('processConfirmModal'));
    modal.show();
}
const processConfirmBtn = document.getElementById('processConfirmBtn');
if (processConfirmBtn) {
    processConfirmBtn.addEventListener('click', function() {
        const input = document.getElementById('processConfirmInput').value.trim();
        const invalidFeedback = document.getElementById('processConfirmInvalid');
        if (input !== 'Process') {
            invalidFeedback.style.display = 'block';
            return;
        }
        invalidFeedback.style.display = 'none';
        // Hide modal
        const modalEl = document.getElementById('processConfirmModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
        // Actually process the order
        if (pendingProcessStudentNumber && pendingProcessTimestamp) {
            markAsInProcess(pendingProcessStudentNumber, pendingProcessTimestamp);
            // --- Google Form Submission ---
            // Find the order object using the pending student number and timestamp
            const findOrder = arr => arr.find(o => o.studentNumber === pendingProcessStudentNumber && o.timestamp === pendingProcessTimestamp);
            const order = findOrder(orders) || findOrder(inProcessOrders) || findOrder(orderHistory) || findOrder(deletedOrders);
            const orderNo = order && order.formIndex ? order.formIndex.toString().padStart(4, '0') : '';
            const studentNumber = order ? order.studentNumber : '';
            const studentName = order ? order.studentName : '';
            const email = order ? order.email : '';
            // Use your actual Google Form URL and entry IDs
            const formUrl = "https://docs.google.com/forms/d/1JnJmQqWlYyiL1C5mJp1ejDNtd-OzBfxtYB8kQ32WkZw/formResponse";
            const formData = new FormData();
            formData.append("entry.1236088729", orderNo);
            formData.append("entry.1808264540", studentNumber);
            formData.append("entry.2073067807", studentName);
            formData.append("entry.182002155", email); // <-- Replace with your actual Email entry ID
            fetch(formUrl, {
                method: "POST",
                mode: "no-cors",
                body: formData
            }).then(() => {
                // Optionally show a notification
                showNotification("Order submitted to Google Form!", "success");
            }).catch((err) => {
                showNotification("Failed to submit to Google Form: " + err, "danger");
            });
            // --- End Google Form Submission ---
        }
        pendingProcessStudentNumber = null;
        pendingProcessTimestamp = null;
    });
    // Allow pressing Enter in the input to trigger the OK button
    const processConfirmInput = document.getElementById('processConfirmInput');
    if (processConfirmInput) {
        processConfirmInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                processConfirmBtn.click();
            }
        });
    }
} 

let pendingDeletedRevertStudentNumber = null;
let pendingDeletedRevertTimestamp = null;
function openDeletedRevertConfirmModal(studentNumber, timestamp) {
    pendingDeletedRevertStudentNumber = studentNumber;
    pendingDeletedRevertTimestamp = timestamp;
    document.getElementById('deletedRevertConfirmInput').value = '';
    document.getElementById('deletedRevertConfirmInvalid').style.display = 'none';
    const modal = new bootstrap.Modal(document.getElementById('deletedRevertConfirmModal'));
    modal.show();
}
const deletedRevertConfirmBtn = document.getElementById('deletedRevertConfirmBtn');
if (deletedRevertConfirmBtn) {
    deletedRevertConfirmBtn.addEventListener('click', function() {
        const input = document.getElementById('deletedRevertConfirmInput').value.trim();
        const invalidFeedback = document.getElementById('deletedRevertConfirmInvalid');
        if (input !== 'Revert') {
            invalidFeedback.style.display = 'block';
            return;
        }
        invalidFeedback.style.display = 'none';
        // Hide modal
        const modalEl = document.getElementById('deletedRevertConfirmModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
        // Actually revert the order
        if (pendingDeletedRevertStudentNumber && pendingDeletedRevertTimestamp) {
            revertDeletedOrder(pendingDeletedRevertStudentNumber, pendingDeletedRevertTimestamp);
        }
        pendingDeletedRevertStudentNumber = null;
        pendingDeletedRevertTimestamp = null;
    });
    // Allow pressing Enter in the input to trigger the OK button
    const deletedRevertConfirmInput = document.getElementById('deletedRevertConfirmInput');
    if (deletedRevertConfirmInput) {
        deletedRevertConfirmInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                deletedRevertConfirmBtn.click();
            }
        });
    }
} 

 

// Add this function to the global scope
window.toggleEmailVisibility = function(emailId, email, btn) {
    const span = document.getElementById(emailId);
    if (!span) return;
    if (span.style.display === 'none') {
        // Hide all other emails
        document.querySelectorAll('[id^="email-cell-"]').forEach(el => { el.style.display = 'none'; });
        document.querySelectorAll('button[data-email-toggle]').forEach(b => { b.textContent = 'Show'; });
        span.textContent = email;
        span.style.display = 'inline';
        btn.textContent = 'Hide';
        btn.setAttribute('data-email-toggle', 'true');
    } else {
        span.style.display = 'none';
        btn.textContent = 'Show';
        btn.removeAttribute('data-email-toggle');
    }
}; 

// Add a helper to mark an order as notified
function markOrderAsNotified(studentNumber, timestamp) {
    const findOrder = arr => arr.find(o => o.studentNumber === studentNumber && o.timestamp === timestamp);
    let order = findOrder(orders) || findOrder(inProcessOrders) || findOrder(orderHistory) || findOrder(deletedOrders);
    if (order) {
        order.notified = true;
        saveOrders();
    }
} 

// Add a helper to normalize paymentStatus
function normalizePaymentStatus(order) {
    if (order.paymentStatus) {
        order.paymentStatus = order.paymentStatus.toLowerCase().trim();
    }
}
// Normalize on load from localStorage
function loadOrdersFromStorage() {
    orders = JSON.parse(localStorage.getItem('orders')) || [];
    inProcessOrders = JSON.parse(localStorage.getItem('inProcessOrders')) || [];
    orderHistory = JSON.parse(localStorage.getItem('orderHistory')) || [];
    deletedOrders = JSON.parse(localStorage.getItem('deletedOrders')) || [];
    [orders, inProcessOrders, orderHistory, deletedOrders].forEach(arr => arr.forEach(normalizePaymentStatus));
}
// Call this at the top of your script (after variable declarations)
loadOrdersFromStorage(); 

// Update the summary section for Orders tab
function updateOrdersSummary() {
    const summaryDiv = document.getElementById('ordersSummary');
    if (!summaryDiv) return;
    // Filter out orders that are in other sections
    const otherSectionKeys = {
        deleted: new Set(deletedOrders.map(order => `${order.studentNumber}_${order.timestamp}`)),
        inProcess: new Set(inProcessOrders.map(order => `${order.studentNumber}_${order.timestamp}`)),
        history: new Set(orderHistory.map(order => `${order.studentNumber}_${order.timestamp}`))
    };
    const visibleOrders = orders.filter(order => {
        const key = `${order.studentNumber}_${order.timestamp}`;
        return !otherSectionKeys.deleted.has(key) && 
               !otherSectionKeys.inProcess.has(key) && 
               !otherSectionKeys.history.has(key);
    });
    // Define ISKOLEHIYO base items (case-insensitive, ignore size info)
    const iskolehiyoBaseItems = [
        'ISKOLEHIYO T-SHIRT V1.1',
        'ISKOLEHIYO T-SHIRT V1.2',
        'ISKOLEHIYO T-SHIRT V1.3',
        'ISKOLEHIYO TOTE BAG V1.1',
        'ISKOLEHIYO TOTE BAG V1.2',
        'AIRPLANE PIN',
        'REMOVE BEFORE FLIGHT TAG'
    ];
    // Define PAGLAOM base items (case-insensitive, ignore size info)
    const paglaomBaseItems = [
        'PAGLAOM V1.1 T-SHIRT',
        'PAGLAOM V1.2 T-SHIRT',
        'Hirono Airplane Sticker',
        'Hirono Computer Enthusiasts Sticker',
        'Hirono Uniform Sticker',
        'Sticker Set A',
        'Sticker Set B'
    ];
    // Helper to extract base name (removes size info in parentheses or after last space if it's a size)
    function getBaseName(itemName) {
        // Remove size in parentheses, e.g., (S), (M), (L), (XL), (XXL), etc.
        let base = itemName.replace(/\s*\([^)]*\)\s*$/, '');
        // Remove trailing size after space, e.g., 'PAGLAOM V1.1 T-SHIRT S'
        base = base.replace(/\s+(S|M|L|XL|XXL|XS|2XL|3XL|4XL)$/i, '');
        return base.trim();
    }
    // Group by item and division
    const paglaomSummary = {};
    const iskolehiyoSummary = {};
    visibleOrders.forEach(order => {
        // Split items if multiple in one order
        const items = order.itemName.split(',').map(i => i.trim()).filter(i => i);
        items.forEach(itemStr => {
            let itemMatch = itemStr.match(/^(.*?)(?:\s*\((\d+)x\))?$/);
            let rawName = itemMatch ? itemMatch[1].trim() : itemStr;
            let quantity = itemMatch && itemMatch[2] ? parseInt(itemMatch[2]) : (order.quantity || 1);
            let baseName = getBaseName(rawName);
            // Extract size (in parentheses or as trailing word)
            let size = null;
            let parenMatch = rawName.match(/\(([^)]+)\)/);
            if (parenMatch) {
                size = parenMatch[1].trim();
            } else {
                let trailing = rawName.match(/\b(S|M|L|XL|XXL|XS|2XL|3XL|4XL)\b$/i);
                if (trailing) size = trailing[1].toUpperCase();
            }
            
            // Create student info object
            const studentInfo = {
                studentNumber: order.studentNumber,
                studentName: order.studentName,
                quantity: quantity,
                paymentStatus: order.paymentStatus,
                timestamp: order.timestamp
            };
            
            // PAGLAOM base items always go to PAGLAOM
            if (paglaomBaseItems.some(b => b.toLowerCase() === baseName.toLowerCase())) {
                if (!paglaomSummary[baseName]) {
                    paglaomSummary[baseName] = { 
                        quantity: 0, 
                        sizes: {},
                        students: []
                    };
                }
                paglaomSummary[baseName].quantity += quantity;
                paglaomSummary[baseName].students.push(studentInfo);
                if (/t-shirt/i.test(baseName) && size) {
                    if (!paglaomSummary[baseName].sizes[size]) {
                        paglaomSummary[baseName].sizes[size] = { quantity: 0, students: [] };
                    }
                    paglaomSummary[baseName].sizes[size].quantity += quantity;
                    paglaomSummary[baseName].sizes[size].students.push(studentInfo);
                }
            } else if (iskolehiyoBaseItems.some(b => b.toLowerCase() === baseName.toLowerCase())) {
                if (!iskolehiyoSummary[baseName]) {
                    iskolehiyoSummary[baseName] = { 
                        quantity: 0, 
                        sizes: {},
                        students: []
                    };
                }
                iskolehiyoSummary[baseName].quantity += quantity;
                iskolehiyoSummary[baseName].students.push(studentInfo);
                if (/t-shirt/i.test(baseName) && size) {
                    if (!iskolehiyoSummary[baseName].sizes[size]) {
                        iskolehiyoSummary[baseName].sizes[size] = { quantity: 0, students: [] };
                    }
                    iskolehiyoSummary[baseName].sizes[size].quantity += quantity;
                    iskolehiyoSummary[baseName].sizes[size].students.push(studentInfo);
                }
            } else {
                if (!paglaomSummary[baseName]) {
                    paglaomSummary[baseName] = { 
                        quantity: 0,
                        students: []
                    };
                }
                paglaomSummary[baseName].quantity += quantity;
                paglaomSummary[baseName].students.push(studentInfo);
            }
        });
    });
    
    // Helper to build a summary table
    function buildTable(title, summaryObj, paglaomBaseOrder = []) {
        let html = `<h6 class='fw-bold mt-3 mb-2'>${title}</h6>`;
        html += '<div class="table-responsive"><table class="table table-sm table-bordered"><thead><tr><th>Item</th><th>Total Quantity</th><th>Students</th></tr></thead><tbody>';
        const items = Object.keys(summaryObj);
        let sortedItems;
        if (title === 'PAGLAOM' && paglaomBaseOrder.length > 0) {
            const baseOrdered = paglaomBaseOrder.filter(item => summaryObj[item]);
            const others = items.filter(item => !baseOrdered.includes(item)).sort();
            sortedItems = [...baseOrdered, ...others];
        } else {
            const tshirts = items.filter(item => /t-shirt/i.test(item)).sort();
            const totebags = items.filter(item => /tote bag/i.test(item)).sort();
            const others = items.filter(item => !tshirts.includes(item) && !totebags.includes(item)).sort();
            sortedItems = [...tshirts, ...totebags, ...others];
        }
        
        sortedItems.forEach((item, idx) => {
            const itemStudents = summaryObj[item].students || [];
            const uniqueStudents = itemStudents.length;
            
            if (/t-shirt/i.test(item)) {
                // Dropdown for T-SHIRT: show total, expandable to show sizes
                const collapseId = `${title.replace(/\s/g, '')}_inprocess_tshirt_${idx}`;
                const sizeMap = summaryObj[item].sizes || {};
                const hasSizes = Object.keys(sizeMap).length > 0;
                
                // Create student dropdown for main item
                const studentDropdownId = `students_inprocess_${title.replace(/\s/g, '')}_${idx}`;
                let studentDropdownHtml = '';
                if (itemStudents.length > 0) {
                    studentDropdownHtml = `<button class="btn btn-sm btn-outline-info" type="button" data-bs-toggle="collapse" data-bs-target="#${studentDropdownId}">
                        ${uniqueStudents} student${uniqueStudents > 1 ? 's' : ''} <i class="bi bi-caret-down-fill"></i>
                    </button>
                    <div class="collapse mt-2" id="${studentDropdownId}">
                        <div class="card card-body p-2">
                            <table class="table table-sm mb-0">
                                <thead><tr><th>Student</th><th>Qty</th><th>Status</th></tr></thead><tbody>`;
                    itemStudents.forEach(student => {
                        const statusClass = student.paymentStatus === 'paid' ? 'text-success' : 
                                          student.paymentStatus === 'unpaid' ? 'text-danger' : 'text-warning';
                        studentDropdownHtml += `<tr>
                            <td>${student.studentName} (${student.studentNumber})</td>
                            <td>${student.quantity}</td>
                            <td class="${statusClass}">${student.paymentStatus}</td>
                        </tr>`;
                    });
                    studentDropdownHtml += `</tbody></table></div></div>`;
                }
                
                html += `<tr data-bs-toggle='collapse' data-bs-target='#${collapseId}' style='cursor:pointer;'>
                            <td><b>${item}</b> <span class='ms-1'><i class='bi bi-caret-down-fill'></i></span></td>
                            <td><b>${summaryObj[item].quantity}</b></td>
                            <td>${studentDropdownHtml}</td>
                        </tr>`;
                if (hasSizes) {
                    // Order sizes as S, M, L, XL, 2XL, 3XL, 4XL, 5XL, then others
                    const allSizes = Object.keys(sizeMap);
                    const orderedSizes = [
                        ...['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].filter(sz => allSizes.includes(sz)),
                        ...allSizes.filter(sz => !['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].includes(sz)).sort()
                    ];
                    html += `<tr class='collapse' id='${collapseId}'><td colspan='3' style='padding:0;'>
                                <table class='table table-sm mb-0'><tbody>`;
                    orderedSizes.forEach(size => {
                        const sizeStudents = sizeMap[size].students || [];
                        const sizeUniqueStudents = sizeStudents.length;
                        
                        // Create student dropdown for size
                        const sizeStudentDropdownId = `students_inprocess_${title.replace(/\s/g, '')}_${idx}_${size}`;
                        let sizeStudentDropdownHtml = '';
                        if (sizeStudents.length > 0) {
                            sizeStudentDropdownHtml = `<button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#${sizeStudentDropdownId}">
                                ${sizeUniqueStudents} student${sizeUniqueStudents > 1 ? 's' : ''} <i class="bi bi-caret-down-fill"></i>
                            </button>
                            <div class="collapse mt-2" id="${sizeStudentDropdownId}">
                                <div class="card card-body p-2">
                                    <table class="table table-sm mb-0">
                                        <thead><tr><th>Student</th><th>Qty</th><th>Status</th></tr></thead><tbody>`;
                            sizeStudents.forEach(student => {
                                const statusClass = student.paymentStatus === 'paid' ? 'text-success' : 
                                                  student.paymentStatus === 'unpaid' ? 'text-danger' : 'text-warning';
                                sizeStudentDropdownHtml += `<tr>
                                    <td>${student.studentName} (${student.studentNumber})</td>
                                    <td>${student.quantity}</td>
                                    <td class="${statusClass}">${student.paymentStatus}</td>
                                </tr>`;
                            });
                            sizeStudentDropdownHtml += `</tbody></table></div></div>`;
                        }
                        
                        html += `<tr><td style='padding-left:2em;'>${size}</td><td>${sizeMap[size].quantity}</td><td>${sizeStudentDropdownHtml}</td></tr>`;
                    });
                    html += `</tbody></table></td></tr>`;
                }
            } else {
                // Create student dropdown for non-t-shirt items
                const studentDropdownId = `students_inprocess_${title.replace(/\s/g, '')}_${idx}`;
                let studentDropdownHtml = '';
                if (itemStudents.length > 0) {
                    studentDropdownHtml = `<button class="btn btn-sm btn-outline-info" type="button" data-bs-toggle="collapse" data-bs-target="#${studentDropdownId}">
                        ${uniqueStudents} student${uniqueStudents > 1 ? 's' : ''} <i class="bi bi-caret-down-fill"></i>
                    </button>
                    <div class="collapse mt-2" id="${studentDropdownId}">
                        <div class="card card-body p-2">
                            <table class="table table-sm mb-0">
                                <thead><tr><th>Student</th><th>Qty</th><th>Status</th></tr></thead><tbody>`;
                    itemStudents.forEach(student => {
                        const statusClass = student.paymentStatus === 'paid' ? 'text-success' : 
                                          student.paymentStatus === 'unpaid' ? 'text-danger' : 'text-warning';
                        studentDropdownHtml += `<tr>
                            <td>${student.studentName} (${student.studentNumber})</td>
                            <td>${student.quantity}</td>
                            <td class="${statusClass}">${student.paymentStatus}</td>
                        </tr>`;
                    });
                    studentDropdownHtml += `</tbody></table></div></div>`;
                }
                
                html += `<tr><td>${item}</td><td>${summaryObj[item].quantity}</td><td>${studentDropdownHtml}</td></tr>`;
            }
        });
        html += '</tbody></table></div>';
        return html;
    }
    let html = '';
    html += buildTable('PAGLAOM', paglaomSummary, paglaomBaseItems);
    html += buildTable('ISKOLEHIYO', iskolehiyoSummary);
    summaryDiv.innerHTML = html;
} 

function openChangePaymentStatusModal(studentNumber, timestamp) {
    pendingChangeStatusStudentNumber = studentNumber;
    pendingChangeStatusTimestamp = timestamp;
    
    // Find the current order to get its payment status (check both orders and inProcessOrders)
    let order = inProcessOrders.find(order => 
        order.studentNumber === studentNumber && order.timestamp === timestamp
    );
    
    if (!order) {
        order = orders.find(order => 
            order.studentNumber === studentNumber && order.timestamp === timestamp
        );
    }
    
    if (order) {
        // Pre-select the current status in the dropdown
        const statusSelect = document.getElementById('paymentStatusSelect');
        if (statusSelect) {
            statusSelect.value = order.paymentStatus;
        }
    }
    
    // Clear the input field
    const input = document.getElementById('changePaymentStatusInput');
    if (input) {
        input.value = '';
    }
    
    // Hide any previous error messages
    const invalidFeedback = document.getElementById('changePaymentStatusInvalid');
    if (invalidFeedback) {
        invalidFeedback.style.display = 'none';
    }
    
    const modal = new bootstrap.Modal(document.getElementById('changePaymentStatusModal'));
    modal.show();
}

// Add back the half-paid to paid modal functionality
let pendingHalfPaidStudentNumber = null;
let pendingHalfPaidTimestamp = null;
function openHalfPaidToPaidModal(studentNumber, timestamp) {
    pendingHalfPaidStudentNumber = studentNumber;
    pendingHalfPaidTimestamp = timestamp;
    document.getElementById('halfPaidToPaidInput').value = '';
    document.getElementById('halfPaidToPaidInvalid').style.display = 'none';
    const modal = new bootstrap.Modal(document.getElementById('halfPaidToPaidModal'));
    modal.show();
}

function changePaymentStatus(studentNumber, timestamp, newStatus) {
    // Find the order in both orders and inProcessOrders arrays
    let order = inProcessOrders.find(order => 
        order.studentNumber === studentNumber && order.timestamp === timestamp
    );
    
    if (!order) {
        order = orders.find(order => 
            order.studentNumber === studentNumber && order.timestamp === timestamp
        );
    }
    
    if (order) {
        const oldStatus = order.paymentStatus;
        
        // If changing to half-paid, set hadInterest
        if (newStatus === 'half-paid') {
            order.hadInterest = true;
        }
        // If changing from half-paid to paid, keep hadInterest
        // If changing from unpaid to paid, no interest
        else if (newStatus === 'paid') {
            if (oldStatus !== 'half-paid') {
                order.hadInterest = false;
            }
        }
        // If changing to unpaid, remove hadInterest
        else if (newStatus === 'unpaid') {
            order.hadInterest = false;
        }
        
        order.paymentStatus = newStatus;
        saveOrders();
        updateOrdersList();
        showNotification(`Order marked as ${newStatus.replace('-', ' ')}.`, 'success');
    }
}

// Add event listener for change payment status button
const changePaymentStatusBtn = document.getElementById('changePaymentStatusBtn');
if (changePaymentStatusBtn) {
    changePaymentStatusBtn.addEventListener('click', function() {
        const input = document.getElementById('changePaymentStatusInput').value.trim();
        const invalidFeedback = document.getElementById('changePaymentStatusInvalid');
        if (input !== 'Confirm') {
            invalidFeedback.style.display = 'block';
            return;
        }
        invalidFeedback.style.display = 'none';

        // Hide modal
        const modalEl = document.getElementById('changePaymentStatusModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();

        // Get selected status and change it
        const newStatus = document.getElementById('paymentStatusSelect').value;
        if (pendingChangeStatusStudentNumber && pendingChangeStatusTimestamp) {
            changePaymentStatus(pendingChangeStatusStudentNumber, pendingChangeStatusTimestamp, newStatus);
        }

        pendingChangeStatusStudentNumber = null;
        pendingChangeStatusTimestamp = null;
    });

    // Allow pressing Enter in the input to trigger the button
    const changePaymentStatusInput = document.getElementById('changePaymentStatusInput');
    if (changePaymentStatusInput) {
        changePaymentStatusInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                changePaymentStatusBtn.click();
            }
        });
    }
}

// Add event listener for half-paid to paid button
const halfPaidToPaidBtn = document.getElementById('halfPaidToPaidBtn');
if (halfPaidToPaidBtn) {
    halfPaidToPaidBtn.addEventListener('click', function() {
        const input = document.getElementById('halfPaidToPaidInput').value.trim();
        const invalidFeedback = document.getElementById('halfPaidToPaidInvalid');
        if (input !== 'Paid') {
            invalidFeedback.style.display = 'block';
            return;
        }
        invalidFeedback.style.display = 'none';
        // Hide modal
        const modalEl = document.getElementById('halfPaidToPaidModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
        // Actually mark as paid
        if (pendingHalfPaidStudentNumber && pendingHalfPaidTimestamp) {
            // Find the order in inProcessOrders and set paymentStatus to 'paid'
            const order = inProcessOrders.find(order => order.studentNumber === pendingHalfPaidStudentNumber && order.timestamp === pendingHalfPaidTimestamp);
            if (order) {
                order.paymentStatus = 'paid';
                order.hadInterest = true; // Track that this order had interest
                saveOrders();
                updateOrdersList();
                showNotification('Order marked as paid.', 'success');
            }
        }
        pendingHalfPaidStudentNumber = null;
        pendingHalfPaidTimestamp = null;
    });
    // Allow pressing Enter in the input to trigger the OK button
    const halfPaidToPaidInput = document.getElementById('halfPaidToPaidInput');
    if (halfPaidToPaidInput) {
        halfPaidToPaidInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                halfPaidToPaidBtn.click();
            }
        });
    }
}

function openClaimToHistoryModal(studentNumber, timestamp) {
    pendingClaimToHistoryStudentNumber = studentNumber;
    pendingClaimToHistoryTimestamp = timestamp;
    const modal = new bootstrap.Modal(document.getElementById('claimToHistoryModal'));
    modal.show();
}

// Add event listener for claim to history button
const claimToHistoryBtn = document.getElementById('claimToHistoryBtn');
if (claimToHistoryBtn) {
    claimToHistoryBtn.addEventListener('click', function() {
        const input = document.getElementById('claimToHistoryInput').value.trim();
        const invalidFeedback = document.getElementById('claimToHistoryInvalid');
        if (input !== 'Move') {
            invalidFeedback.style.display = 'block';
            return;
        }
        invalidFeedback.style.display = 'none';
        // Hide modal
        const modalEl = document.getElementById('claimToHistoryModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
        // Move the order to history
        if (pendingClaimToHistoryStudentNumber && pendingClaimToHistoryTimestamp) {
            const orderToMove = inProcessOrders.find(order => 
                order.studentNumber === pendingClaimToHistoryStudentNumber && order.timestamp === pendingClaimToHistoryTimestamp
            );
            if (orderToMove) {
                orderHistory.push(orderToMove);
                inProcessOrders = inProcessOrders.filter(order => 
                    !(order.studentNumber === pendingClaimToHistoryStudentNumber && order.timestamp === pendingClaimToHistoryTimestamp)
                );
                saveOrders();
                updateOrdersList();
                showNotification('Order moved to history', 'success');
            }
        }
        pendingClaimToHistoryStudentNumber = null;
        pendingClaimToHistoryTimestamp = null;
    });

    // Allow pressing Enter in the input to trigger the button
    const claimToHistoryInput = document.getElementById('claimToHistoryInput');
    if (claimToHistoryInput) {
        claimToHistoryInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                claimToHistoryBtn.click();
            }
        });
    }
}