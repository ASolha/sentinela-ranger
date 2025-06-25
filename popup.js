// popup.js - Script do popup da extensão
document.addEventListener('DOMContentLoaded', function() {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const orderCount = document.getElementById('orderCount');
    const lastCheck = document.getElementById('lastCheck');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const logBtn = document.getElementById('logBtn');
    const clearBtn = document.getElementById('clearBtn');
    const logContainer = document.getElementById('logContainer');
    const logContent = document.getElementById('logContent');
    
    let isLogVisible = false;
    
    // Atualiza o status quando o popup abre
    updateStatus();
    
    // Atualiza a cada 2 segundos
    setInterval(updateStatus, 2000);
    
    // Event listeners
    startBtn.addEventListener('click', function() {
        chrome.runtime.sendMessage({ action: 'toggleMonitoring' }, function(response) {
            if (response && response.isMonitoring) {
                updateStatus();
            }
        });
    });
    
    stopBtn.addEventListener('click', function() {
        chrome.runtime.sendMessage({ action: 'toggleMonitoring' }, function(response) {
            if (response && !response.isMonitoring) {
                updateStatus();
            }
        });
    });
    
    logBtn.addEventListener('click', function() {
        toggleLog();
    });
    
    clearBtn.addEventListener('click', function() {
        if (confirm('Tem certeza que deseja limpar o log de pedidos?')) {
            chrome.runtime.sendMessage({ action: 'clearLog' }, function(response) {
                if (response && response.success) {
                    updateStatus();
                    if (isLogVisible) {
                        loadLog();
                    }
                    alert('Log limpo com sucesso!');
                }
            });
        }
    });
    
    function updateStatus() {
        chrome.runtime.sendMessage({ action: 'getStatus' }, function(response) {
            if (response) {
                const isMonitoring = response.isMonitoring;
                const count = response.notifiedOrdersCount;
                
                // Atualiza indicador de status
                if (isMonitoring) {
                    statusIndicator.className = 'status-indicator status-active';
                    statusText.textContent = 'Monitoramento ATIVO';
                    startBtn.style.display = 'none';
                    stopBtn.style.display = 'block';
                } else {
                    statusIndicator.className = 'status-indicator status-inactive';
                    statusText.textContent = 'Monitoramento INATIVO';
                    startBtn.style.display = 'block';
                    stopBtn.style.display = 'none';
                }
                
                // Atualiza contadores
                orderCount.textContent = count;
                lastCheck.textContent = new Date().toLocaleTimeString();
            }
        });
    }
    
    function toggleLog() {
        if (isLogVisible) {
            logContainer.style.display = 'none';
            logBtn.textContent = 'Ver Log de Pedidos';
            isLogVisible = false;
        } else {
            loadLog();
            logContainer.style.display = 'block';
            logBtn.textContent = 'Ocultar Log';
            isLogVisible = true;
        }
    }
    
    function loadLog() {
        chrome.runtime.sendMessage({ action: 'getLog' }, function(response) {
            if (response && response.orders) {
                logContent.innerHTML = '';
                
                if (response.orders.length === 0) {
                    logContent.innerHTML = '<div class="log-item">Nenhum pedido detectado ainda</div>';
                } else {
                    response.orders.forEach(function(order, index) {
                        const logItem = document.createElement('div');
                        logItem.className = 'log-item';
                        logItem.textContent = `${index + 1}. ${order}`;
                        logContent.appendChild(logItem);
                    });
                }
            }
        });
    }
});