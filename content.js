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

// >>> FUNÇÃO checkForOrders CORRIGIDA (AGORA FAZ O HIGHLIGHT E MOSTRA A NOTIFICAÇÃO) <<<
function checkForOrders() {
  if (!isMonitoring) return;
  
  let foundCases = [];

  // --- LÓGICA DE DETECÇÃO DE PEDIDOS (SEM ALTERAÇÃO) ---
  try {
    const currentContent = document.body.innerText;
    
    if (currentContent === lastProcessedContent) {
      // Se o conteúdo não mudou, apenas verifica se a notificação persistente deve continuar
      // (Isso será feito pelo highlightTargetElements)
    } else {
        // Lógica de detecção de pedidos (Venda #, Pedido # etc.)
        const pageText = currentContent.toLowerCase();
        
        if (pageText.includes('2 unidades')) {
          const orderPatterns = [
            /venda\s*#\s*(\d+)/gi,
            /pedido\s*#\s*(\d+)/gi,
            /ordem\s*#\s*(\d+)/gi,
            /venda\s*(\d{4,})/gi,
            /pedido\s*(\d{4,})/gi
          ];
          
          let foundOrders = [];
          const fullText = document.body.innerText;
          
          orderPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(fullText)) !== null) {
              const orderNumber = match[0];
              if (!foundOrders.includes(orderNumber)) {
                foundOrders.push(orderNumber);
              }
            }
          });
          
          const selectors = [
            '[class*="order"]', '[class*="venda"]', '[class*="pedido"]', '[id*="order"]',
            '[id*="venda"]', '[id*="pedido"]', 'h1, h2, h3, h4, h5, h6', '.title, .header, .info'
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
          
          foundOrders.forEach(orderNumber => {
            const elementHash = hashCode(currentContent + orderNumber + window.location.href);
            chrome.runtime.sendMessage({
              action: 'orderFound',
              orderNumber: orderNumber,
              elementHash: elementHash
            });
          });
        }
        
        lastProcessedContent = currentContent;
    }
  } catch (error) {
    console.error('Erro na verificação de pedidos:', error);
  }
  // --- FIM DA LÓGICA DE DETECÇÃO DE PEDIDOS ---


  // --- LÓGICA DE DESTAQUE E NOTIFICAÇÃO PERMANENTE (MOVIDA E AJUSTADA) ---
  try {
    // 1. Desconecta o observer para evitar loops infinitos (mantido aqui por segurança)
    let wasObserverActive = false;
    if (observer) {
      observer.disconnect();
      wasObserverActive = true;
    }

    // Lógica de highlight e detecção dos casos
    foundCases = detectAndHighlightCases();

    // Mostra/Remove notificação persistente se encontrou algum caso
    if (foundCases.length > 0) {
      console.log('Sentinela: Casos encontrados:', foundCases);
      showPersistentNotification([...new Set(foundCases)]);
    } else {
      const existingNotif = document.getElementById('sentinela-persistent-notification');
      if (existingNotif) existingNotif.remove();
    }
    
    // 2. Reconecta o observer
    if (wasObserverActive && observer) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  } catch (error) {
    console.error('Erro ao destacar/mostrar notificação:', error);
  }
}

// >>> FUNÇÃO PRINCIPAL DE DESTAQUE AGORA SE CHAMA detectAndHighlightCases <<<
function detectAndHighlightCases() {
  let foundCases = [];

  // Remove todos os destaques antes de refazer
  document.querySelectorAll('.sentinela-target').forEach(el => {
    el.classList.remove('sentinela-target');
    el.style.removeProperty('background-color');
    el.style.removeProperty('box-shadow');
    el.style.removeProperty('border-radius');
    el.style.removeProperty('padding');
    el.style.removeProperty('margin');
  });

  document.querySelectorAll('.sentinela-target-text').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
    }
  });


  // 1. Verifica "2 unidades" no elemento específico
  const quantityElements = document.querySelectorAll('.sc-quantity.sc-quantity__unique span');
  quantityElements.forEach(el => {
    if (el.textContent.toLowerCase().includes('2 unidades')) {
      foundCases.push('2 unidades');
      createHighlight(el);
    }
  });
  
  // 2. Verifica "com pedra" e comparação de tamanhos no sublabel
  const sublabelElements = document.querySelectorAll('.sc-title-subtitle-action__sublabel, .section-item-information');

  sublabelElements.forEach(el => {
    const text = el.textContent;
    
    if (text.toLowerCase().includes('com pedra')) {
      foundCases.push('com pedra');
      highlightTextInElement(el, 'com pedra');
    }
    
    const femaleRegex = /Tamanho::?\s*Feminino\s*-\s*(\d+)/i;
    const maleRegex = /Tamanho::?\s*Masculino\s*-\s*(\d+)/i;
    
    const femaleMatch = text.match(femaleRegex);
    const maleMatch = text.match(maleRegex);
    
    if (femaleMatch && maleMatch) {
      const femaleSize = parseInt(femaleMatch[1]);
      const maleSize = parseInt(maleMatch[1]);
      
      if (femaleSize > maleSize) {
        const caseMessage = `Tamanho Feminino (${femaleSize}) > Masculino (${maleSize})`;
        foundCases.push(caseMessage);
        
        createHighlight(el);
        
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
      createHighlight(el.parentNode);
    }
  });

  // 4. Verifica "6mm Banhada Ouro Com Friso Prateado" 
  const allTextElements = document.querySelectorAll('.sc-detail-title__text, .andes-list__item-primary, .sc-title-subtitle-action__sublabel, [class*="title"], [class*="description"]');
  allTextElements.forEach(el => {
    const text = el.textContent;
    if (text.includes('6mm Banhada Ouro Com Friso Prateado') || 
        text.includes('6mm banhada ouro com friso prateado') ||
        text.toLowerCase().includes('6mm banhada ouro com friso prateado')) {
      foundCases.push('6mm Banhada Ouro Com Friso Prateado');
      highlightTextInElement(el, '6mm Banhada Ouro Com Friso Prateado');
    }
  });
  
  // 5. Verifica "Ver mensagens" no botão (detecta mas NÃO destaca)
  const messageButtons = document.querySelectorAll('.andes-button__content');
  messageButtons.forEach(el => {
    if (el.textContent.trim() === 'Ver mensagens') {
      foundCases.push('Ver mensagens');
    }
  });

  return foundCases;
}

// >>> FUNÇÃO DESTAQUE DE TEXTO SIMPLIFICADA <<<
function highlightTextInElement(element, textToHighlight) {
  if (element.querySelector('.sentinela-target-text')) {
    return;
  }
  
  const innerHTML = element.innerHTML;
  const regex = new RegExp(`(${textToHighlight})`, 'gi');
  
  if (innerHTML.toLowerCase().includes(textToHighlight.toLowerCase())) {
    const newInnerHTML = innerHTML.replace(regex, (match) => {
      return `<span class="sentinela-target-text" style="background-color: rgba(255, 0, 0, 0.2); border-radius: 4px;">${match}</span>`;
    });
    element.innerHTML = newInnerHTML;
  }
}

// Função para aplicar destaque a um elemento inteiro
function createHighlight(element) {
  element.classList.add('sentinela-target');
  element.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
  element.style.boxShadow = 'inset 0 0 0 2px red';
  element.style.borderRadius = '4px';
  element.style.padding = '0';
  element.style.margin = '0';
}


// >>> FUNÇÕES DE ARRRASTAR E NOTIFICAÇÃO (SEM ALTERAÇÃO) <<<
function makeElementDraggable(elementToDrag, handleElement) {
  let isDragging = false;
  let offsetX, offsetY;

  handleElement.style.cursor = 'grab';

  handleElement.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;

    e.preventDefault();
    isDragging = true;
    
    const rect = elementToDrag.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    elementToDrag.style.right = 'auto';
    elementToDrag.style.bottom = 'auto';
    elementToDrag.style.left = `${rect.left}px`;
    elementToDrag.style.top = `${rect.top}px`;
    
    handleElement.style.cursor = 'grabbing';
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    
    e.preventDefault();

    let newX = e.clientX - offsetX;
    let newY = e.clientY - offsetY;
    
    const maxX = window.innerWidth - elementToDrag.offsetWidth;
    const maxY = window.innerHeight - elementToDrag.offsetHeight;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    elementToDrag.style.left = `${newX}px`;
    elementToDrag.style.top = `${newY}px`;
  }

  function onMouseUp() {
    if (!isDragging) return;

    isDragging = false;
    handleElement.style.cursor = 'grab';
    
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    const finalPosition = {
      left: elementToDrag.style.left,
      top: elementToDrag.style.top
    };
    
    chrome.storage.local.set({ 'sentinelaNotificationPosition': finalPosition }, () => {
      console.log('Sentinela: Posição da notificação salva.', finalPosition);
    });
  }
}

function showPersistentNotification(cases) {
  console.log('Sentinela: Criando notificação para casos:', cases);
  
  const existingNotif = document.getElementById('sentinela-persistent-notification');
  if (existingNotif) existingNotif.remove();
  
  const notification = document.createElement('div');
  notification.id = 'sentinela-persistent-notification';
  
  notification.style.cssText = `
    position: fixed;
    background: linear-gradient(135deg, #ff0000 0%, #8b0000 100%);
    color: white;
    padding: 15px;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 999999;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: bold;
    max-width: 350px;
    border: 2px solid white;
    display: flex;
    align-items: center;
    gap: 12px;
  `;
  
  const dragHandle = document.createElement('div');
  dragHandle.innerHTML = '&#8942;';
  dragHandle.style.cssText = `
    font-size: 24px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.7);
    user-select: none;
    align-self: stretch;
    display: flex;
    align-items: center;
  `;

  const contentWrapper = document.createElement('div');
  contentWrapper.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  `;

  const logoImg = document.createElement('img');
  logoImg.src = chrome.runtime.getURL('icon128.png');
  logoImg.style.cssText = 'width: 24px; height: 24px; margin-bottom: 8px;';
  
  const title = document.createElement('div');
  title.textContent = 'Atenção aos itens';
  title.style.cssText = 'font-size: 16px; margin-bottom: 8px; font-weight: bold;';
  
  const caseList = document.createElement('div');
  caseList.style.cssText = 'text-align: left; font-size: 13px;';
  caseList.innerHTML = cases.map(c => `• ${c}`).join('<br>');
  
  contentWrapper.appendChild(logoImg);
  contentWrapper.appendChild(title);
  contentWrapper.appendChild(caseList);
  
  notification.appendChild(dragHandle);
  notification.appendChild(contentWrapper);
  
  document.body.appendChild(notification);
  
  chrome.storage.local.get(['sentinelaNotificationPosition'], (result) => {
    if (result.sentinelaNotificationPosition) {
      notification.style.left = result.sentinelaNotificationPosition.left;
      notification.style.top = result.sentinelaNotificationPosition.top;
      notification.style.right = 'auto';
      notification.style.bottom = 'auto';
      console.log('Sentinela: Posição da notificação carregada.', result.sentinelaNotificationPosition);
    } else {
      notification.style.right = '20px';
      notification.style.bottom = '50px';
    }
    
    makeElementDraggable(notification, dragHandle);
  });
  
  console.log('Sentinela: Notificação criada e adicionada ao DOM');
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
  
  notification.querySelector('div').insertBefore(logoImg, notification.querySelector('strong'));
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.5s ease-out';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 500);
  }, 20000);
  
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