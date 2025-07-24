// content.js - Script que monitora a página
let isMonitoring = true;
let observer = null;
let checkInterval = null;
let lastProcessedContent = ''; // Para detectar mudanças reais no conteúdo

// Inicializa o monitoramento quando a página carrega
initialize();

async function initialize() {
  // Verifica o status do monitoramento
  const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
  isMonitoring = response.isMonitoring;
  
  if (isMonitoring) {
    startMonitoring();
  } else {
    // Inicia automaticamente mesmo se o status não estiver ativo
    chrome.runtime.sendMessage({ action: 'toggleMonitoring' });
    startMonitoring();
  }
}

// Escuta mensagens do background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'playAlert') {
    playAlertSound();
    showInPageNotification(message.orderNumber);
  } else if (message.action === 'monitoringStatusChanged') {
    isMonitoring = message.isMonitoring;
    if (isMonitoring) {
      startMonitoring();
    } else {
      stopMonitoring();
    }
  }
});

function startMonitoring() {
  if (observer || checkInterval) {
    stopMonitoring();
  }
  
  console.log('Sentinela Ranger: Monitoramento iniciado');
  
  // Verifica imediatamente
  checkForOrders();
  highlightTargetElements();
  
  // Configura observer para mudanças no DOM
  observer = new MutationObserver(() => {
    // Adiciona um pequeno delay para evitar múltiplas verificações
    setTimeout(() => {
      checkForOrders();
      highlightTargetElements();
    }, 500);
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  // Verifica periodicamente (backup) - aumentado para 5 segundos
  checkInterval = setInterval(() => {
    checkForOrders();
    highlightTargetElements();
  }, 5000);
}

function stopMonitoring() {
  console.log('Sentinela Ranger: Monitoramento parado');
  
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  
  // Limpa conteúdo processado
  lastProcessedContent = '';
  
  // Remove all highlights by class
  document.querySelectorAll('.sentinela-target').forEach(el => {
    el.classList.remove('sentinela-target'); // Remove the class
    // Remove inline styles if applied directly, or rely on them being overwritten by normal CSS
    el.style.removeProperty('background-color');
    el.style.removeProperty('box-shadow'); // For the border effect
    el.style.removeProperty('border-radius');
    el.style.removeProperty('padding');
    el.style.removeProperty('margin');
  });

  // Remove previous inline text highlights
  document.querySelectorAll('.sentinela-target-text').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      // Move children of the highlight span back to the parent
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el); // Remove the highlight span itself
    }
  });
  
  const existingNotif = document.getElementById('sentinela-persistent-notification');
  if (existingNotif) existingNotif.remove();
}

function checkForOrders() {
  if (!isMonitoring) return;
  
  try {
    // Obtém o conteúdo atual da página
    const currentContent = document.body.innerText;
    
    // Se o conteúdo não mudou, não precisa verificar novamente
    if (currentContent === lastProcessedContent) {
      return;
    }
    
    // Busca por texto "2 unidades" (case insensitive)
    const pageText = currentContent.toLowerCase();
    
    if (pageText.includes('2 unidades')) {
      // Procura por padrões de número de venda
      const orderPatterns = [
        /venda\s*#\s*(\d+)/gi,
        /pedido\s*#\s*(\d+)/gi,
        /ordem\s*#\s*(\d+)/gi,
        /venda\s*(\d{4,})/gi,
        /pedido\s*(\d{4,})/gi
      ];
      
      let foundOrders = [];
      
      // Busca no texto completo da página
      const fullText = document.body.innerText;
      
      orderPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(fullText)) !== null) {
          const orderNumber = match[0]; // Captura o match completo
          if (!foundOrders.includes(orderNumber)) {
            foundOrders.push(orderNumber);
          }
        }
      });
      
      // Busca mais específica em elementos que podem conter informações de venda
      const selectors = [
        '[class*="order"]',
        '[class*="venda"]',
        '[class*="pedido"]',
        '[id*="order"]',
        '[id*="venda"]',
        '[id*="pedido"]',
        'h1, h2, h3, h4, h5, h6',
        '.title, .header, .info'
      ];
      
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          const text = element.textContent;
          orderPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
              const orderNumber = match[0];
              if (!foundOrders.includes(orderNumber)) {
                foundOrders.push(orderNumber);
              }
            }
          });
        });
      });
      
      // Reporta cada pedido encontrado com hash único
      foundOrders.forEach(orderNumber => {
        // Cria um hash único baseado no conteúdo e posição do elemento
        const elementHash = hashCode(currentContent + orderNumber + window.location.href);
        
        chrome.runtime.sendMessage({
          action: 'orderFound',
          orderNumber: orderNumber,
          elementHash: elementHash
        });
      });
    }
    
    // Atualiza o conteúdo processado
    lastProcessedContent = currentContent;
  } catch (error) {
    console.error('Erro no Sentinela Ranger:', error);
  }
}

function highlightTargetElements() {
  if (!isMonitoring) return;
  
  try {
    // Remove all previous highlights by class
    document.querySelectorAll('.sentinela-target').forEach(el => {
      el.classList.remove('sentinela-target');
      el.style.removeProperty('background-color');
      el.style.removeProperty('box-shadow');
      el.style.removeProperty('border-radius');
      el.style.removeProperty('padding');
      el.style.removeProperty('margin');
    });

    // Remove previous inline text highlights
    document.querySelectorAll('.sentinela-target-text').forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        // Move children of the highlight span back to the parent
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el); // Remove the highlight span itself
      }
    });
    
    let foundCases = [];
    
    // 1. Verifica "2 unidades" no elemento específico
    const quantityElements = document.querySelectorAll('.sc-quantity.sc-quantity__unique span');
    quantityElements.forEach(el => {
      if (el.textContent.toLowerCase().includes('2 unidades')) {
        foundCases.push('2 unidades');
        createHighlight(el);
      }
    });
    
    // 2. Verifica "com pedra" e comparação de tamanhos no sublabel
    const sublabelElements = document.querySelectorAll('.sc-title-subtitle-action__sublabel');
    sublabelElements.forEach(el => {
      const text = el.textContent;
      
      // Verifica "com pedra"
      if (text.toLowerCase().includes('com pedra')) {
        foundCases.push('com pedra');
        // Find the specific text node and highlight only that part
        highlightTextInElement(el, 'com pedra');
      }
      
      // Verifica comparação de tamanhos - FUNCIONA EM QUALQUER ORDEM
      // Procura por ambos os tamanhos independentemente da ordem
      const femaleRegex = /Tamanho::?\s*Feminino\s*-\s*(\d+)/i;
      const maleRegex = /Tamanho::?\s*Masculino\s*-\s*(\d+)/i;
      
      const femaleMatch = text.match(femaleRegex);
      const maleMatch = text.match(maleRegex);
      
      if (femaleMatch && maleMatch) {
        const femaleSize = parseInt(femaleMatch[1]);
        const maleSize = parseInt(maleMatch[1]);
        
        console.log(`Sentinela: Encontrado - Feminino: ${femaleSize}, Masculino: ${maleSize}`);
        
        if (femaleSize > maleSize) {
          const caseMessage = `Tamanho Feminino (${femaleSize}) > Masculino (${maleSize})`;
          foundCases.push(caseMessage);
          
          console.log(`Sentinela ALERTA: ${caseMessage}`);
          
          // Destaca o elemento inteiro que contém a informação
          createHighlight(el); // Apply highlight to the sublabel element
          
          // Envia notificação específica para o background script
          chrome.runtime.sendMessage({
            action: 'sizeAlert',
            message: caseMessage,
            femaleSize: femaleSize,
            maleSize: maleSize
          });
        }
      }
    });
    
    // 3. Verifica "1 pacote" no título
    const titleElements = document.querySelectorAll('.sc-detail-title__text');
    titleElements.forEach(el => {
      if (el.textContent.includes('1 pacote')) {
        foundCases.push('1 pacote');
        createHighlight(el.parentNode); // Destaca o container pai para melhor visualização
      }
    });
    
    // 4. Verifica "Ver mensagens" no botão (detecta mas NÃO destaca)
    const messageButtons = document.querySelectorAll('.andes-button__content');
    messageButtons.forEach(el => {
      if (el.textContent.trim() === 'Ver mensagens') {
        foundCases.push('Ver mensagens');
        // NÃO aplica createHighlight() para não destacar visualmente
      }
    });
    
    // Mostra notificação persistente se encontrou algum caso
    if (foundCases.length > 0) {
      console.log('Sentinela: Casos encontrados:', foundCases); // Debug
      showPersistentNotification([...new Set(foundCases)]); // Remove duplicatas
    } else {
      const existingNotif = document.getElementById('sentinela-persistent-notification');
      if (existingNotif) existingNotif.remove();
    }
  } catch (error) {
    console.error('Erro ao destacar elementos:', error);
  }
}

// Function to highlight specific text within an element
function highlightTextInElement(element, textToHighlight) {
  const innerHTML = element.innerHTML;
  // Use a regex to find the text and replace it with a styled span
  const regex = new RegExp(`(${textToHighlight})`, 'gi');
  
  if (innerHTML.toLowerCase().includes(textToHighlight.toLowerCase())) {
    const newInnerHTML = innerHTML.replace(regex, (match) => {
      // Removed padding, margin, border, line-height to prevent layout shifts
      return `<span class="sentinela-target-text" style="background-color: rgba(255, 0, 0, 0.2); border-radius: 4px;">${match}</span>`;
    });
    element.innerHTML = newInnerHTML;
  }
}

// Function to apply highlight to an entire element without wrapping
function createHighlight(element) {
  // Apply the class directly to the element
  element.classList.add('sentinela-target');
  // Apply direct styles that don't affect layout
  element.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
  element.style.boxShadow = 'inset 0 0 0 2px red'; // Use box-shadow for border effect
  element.style.borderRadius = '4px';
  // Ensure no conflicting inline styles from previous runs or other scripts
  element.style.padding = '0';
  element.style.margin = '0';
}


function showPersistentNotification(cases) {
  console.log('Sentinela: Criando notificação para casos:', cases); // Debug
  
  // Remove notificação anterior se existir
  const existingNotif = document.getElementById('sentinela-persistent-notification');
  if (existingNotif) existingNotif.remove();
  
  const notification = document.createElement('div');
  notification.id = 'sentinela-persistent-notification';
  notification.style.cssText = `
    position: fixed;
    bottom: 50px;
    right: 20px;
    background: linear-gradient(135deg, #ff0000 0%, #8b0000 100%);
    color: white;
    padding: 15px 25px;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 999999;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: bold;
    max-width: 350px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 2px solid white;
  `;
  
  // Adiciona animação CSS
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
  notification.style.animation = 'pulse 2s infinite';
  
  // Carrega o logotipo personalizado
  const logoImg = document.createElement('img');
  logoImg.src = chrome.runtime.getURL('icon128.png');
  logoImg.style.cssText = 'width: 24px; height: 24px; margin-bottom: 8px;';
  
  // Cria conteúdo da notificação
  const title = document.createElement('div');
  title.textContent = 'Atenção aos itens';
  title.style.cssText = 'font-size: 16px; margin-bottom: 8px; font-weight: bold;';
  
  const caseList = document.createElement('div');
  caseList.style.cssText = 'text-align: left; font-size: 13px;';
  caseList.innerHTML = cases.map(c => `• ${c}`).join('<br>');
  
  notification.appendChild(logoImg);
  notification.appendChild(title);
  notification.appendChild(caseList);
  
  document.body.appendChild(notification);
  
  console.log('Sentinela: Notificação criada e adicionada ao DOM'); // Debug
}

// Função para criar hash único
function hashCode(str) {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Converte para 32-bit integer
  }
  return hash.toString();
}

function playAlertSound() {
  try {
    const audio = new Audio(chrome.runtime.getURL('alerta.wav'));
    audio.volume = 0.8;
    audio.play().catch(error => {
      console.error('Erro ao reproduzir áudio:', error);
    });
  } catch (error) {
    console.error('Erro ao criar áudio:', error);
  }
}

function showInPageNotification(orderNumber) {
  // Cria uma notificação visual na própria página como backup
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 999999;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: bold;
    max-width: 300px;
    animation: slideIn 0.5s ease-out;
  `;
  
  // Adiciona animação CSS
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
  
  // Carrega o logotipo personalizado
  const logoImg = document.createElement('img');
  logoImg.src = chrome.runtime.getURL('icon128.png');
  logoImg.style.cssText = 'width: 18px; height: 18px; margin-right: 8px; vertical-align: middle;';
  
  notification.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 8px;">
      <strong> ALERTA ! </strong>
    </div>
    <div>Detectado pedido com 2 unidades</div>
    <div style="margin-top: 5px; font-size: 12px; opacity: 0.9;">${orderNumber}</div>
  `;
  
  // Insere o logotipo no início
  notification.querySelector('div').insertBefore(logoImg, notification.querySelector('strong'));
  
  document.body.appendChild(notification);
  
  // Remove a notificação após 20 segundos (20000ms)
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.5s ease-out';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 500);
  }, 20000);
  
  // Remove ao clicar
  notification.addEventListener('click', () => {
    notification.style.animation = 'slideOut 0.5s ease-out';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 500);
  });
}

// Cleanup quando a página é descarregada
window.addEventListener('beforeunload', () => {
  stopMonitoring();
});