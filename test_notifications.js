// test-notifications.js
// Arquivo para testar as notificações - adicione este botão no popup.html se necessário

function testNotification() {
  chrome.runtime.sendMessage({
    action: 'orderFound',
    orderNumber: 'Venda #TESTE-' + Date.now()
  });
}

// Para testar, você pode executar no console do popup:
// testNotification();