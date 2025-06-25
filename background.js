// background.js - Service Worker da extensão (Versão Final)
let isMonitoring = true;
let notifiedOrders = new Set();
let processedElements = new Set();

// Função para garantir o carregamento do ícone
function getNotificationIcon() {
  const iconPath = chrome.runtime.getURL('icon128.png');
  // Verificação adicional para desenvolvimento
  console.log('[DEBUG] Caminho do ícone:', iconPath); 
  return iconPath;
}

// Inicialização
chrome.runtime.onStartup.addListener(initializeExtension);
chrome.runtime.onInstalled.addListener(() => {
  initializeExtension();
  requestNotificationPermission();
});

async function requestNotificationPermission() {
  const permission = await chrome.notifications.getPermissionLevel();
  if (permission !== 'granted') {
    console.log('Solicitando permissão para notificações...');
  }
}

async function initializeExtension() {
  const { notifiedOrders: storedOrders, isMonitoring: storedMonitoring } = await chrome.storage.local.get([
    'notifiedOrders',
    'isMonitoring'
  ]);

  if (storedOrders) notifiedOrders = new Set(storedOrders);
  if (storedMonitoring !== undefined) isMonitoring = storedMonitoring;

  await chrome.storage.local.set({
    isMonitoring,
    notifiedOrders: Array.from(notifiedOrders)
  });

  processedElements.clear();
}

// Sistema de Mensagens
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'orderFound':
      handleOrderFound(message.orderNumber, message.elementHash, sender.tab);
      break;
    case 'getStatus':
      sendResponse({ isMonitoring, notifiedOrdersCount: notifiedOrders.size });
      break;
    case 'toggleMonitoring':
      toggleMonitoring();
      sendResponse({ isMonitoring });
      break;
    case 'getLog':
      sendResponse({ orders: Array.from(notifiedOrders) });
      break;
    case 'clearLog':
      clearLog();
      sendResponse({ success: true });
      break;
  }
});

// Lógica Principal
async function handleOrderFound(orderNumber, elementHash, tab) {
  if (!isMonitoring) return;

  // Verificação de duplicatas
  const uniqueKey = `${tab.id}-${elementHash}-${orderNumber}`;
  if (notifiedOrders.has(orderNumber) || processedElements.has(uniqueKey)) {
    return;
  }

  // Atualiza estados
  processedElements.add(uniqueKey);
  notifiedOrders.add(orderNumber);
  await chrome.storage.local.set({ notifiedOrders: Array.from(notifiedOrders) });

  // Cria notificação
  const notificationId = `sentinela_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  
  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: getNotificationIcon(),
      title: 'Sentinela Ranger - Nova Venda!',
      message: `Detectada venda com 2 unidades:\n${orderNumber}`,
      priority: 2,
      requireInteraction: true,
      silent: false
    });

    // Remove após 30 segundos
    setTimeout(() => chrome.notifications.clear(notificationId), 30000);

  } catch (error) {
    console.error('Erro na notificação principal:', error);
    // Fallback simplificado
    chrome.notifications.create({
      type: 'basic',
      iconUrl: getNotificationIcon(),
      title: 'Sentinela Ranger',
      message: `Nova venda: ${orderNumber}`
    });
  }

  // Toca o alerta sonoro
  chrome.tabs.sendMessage(tab.id, { action: 'playAlert', orderNumber }).catch(console.error);

  console.log(`✅ Venda detectada: ${orderNumber} - ${new Date().toLocaleString()}`);
}

// Funções Auxiliares
async function toggleMonitoring() {
  isMonitoring = !isMonitoring;
  await chrome.storage.local.set({ isMonitoring });
  processedElements.clear();
  
  // Notifica todas as tabs
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, {
      action: 'monitoringStatusChanged',
      isMonitoring
    }).catch(() => {});
  });
}

async function clearLog() {
  notifiedOrders.clear();
  processedElements.clear();
  await chrome.storage.local.set({ notifiedOrders: [] });
}

// Listeners de Notificação
chrome.notifications.onClicked.addListener(notificationId => {
  chrome.notifications.clear(notificationId);
});

chrome.notifications.onClosed.addListener((id, byUser) => {
  console.log(`Notificação ${id} fechada ${byUser ? 'pelo usuário' : 'automaticamente'}`);
});