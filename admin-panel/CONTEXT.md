# AliTerra Admin Panel — Полный контекст проекта

> Документ актуален на: апрель 2026  
> Репозиторий: https://github.com/aliter230880/deploy_all  
> Папка в репо: `admin-panel/`  
> Артефакт Replit: `artifacts/contract-admin`

---

## 1. Назначение и цели

Полностью клиентская (100% client-side, без бэкенда) панель управления смарт-контрактами для администратора AliTerra.

**Кто использует:** один администратор — `0xB19aEe699eb4D2Af380c505E4d6A108b055916eB`  
**Зачем:** деплой, чтение, запись, быстрые действия и история транзакций по контрактам в сетях Polygon и BSC — прямо через MetaMask.

**Принципы:**
- Нет бэкенда, нет БД, нет API-ключей
- Пароль хранится локально (SHA-256 в `localStorage`)
- Все транзакции подписываются через MetaMask
- Тёмная нeon-тема: cyan/purple, шрифт monospace

---

## 2. Стек технологий

| Слой | Технология |
|------|-----------|
| Фреймворк | React 18 + Vite 7 |
| Язык | TypeScript |
| Стили | Tailwind CSS v4 |
| UI-компоненты | shadcn/ui (Card, Button, Badge, Input, Select, AlertDialog, Toast) |
| Роутинг | wouter (легковесный, без react-router) |
| Web3 | ethers.js v5 |
| Кошелёк | MetaMask (window.ethereum) |
| Сборка | pnpm monorepo workspace |
| Репозиторий | GitHub (через Replit GitHub Connector + @replit/connectors-sdk) |

---

## 3. Архитектура файлов

```
artifacts/contract-admin/
├── src/
│   ├── pages/
│   │   ├── Login.tsx          # Страница входа + установка пароля
│   │   └── Dashboard.tsx      # Главный layout: сайдбар, шапка, сетевой выбор
│   ├── components/
│   │   ├── Deploy.tsx         # Деплой контрактов + Token Deployer
│   │   ├── ReadContract.tsx   # Вызов view-функций контракта
│   │   ├── WriteContract.tsx  # Вызов write-функций (с подтверждением)
│   │   ├── QuickActions.tsx   # Быстрые действия: admin key, export events, etc.
│   │   └── TxHistory.tsx      # Список транзакций сессии
│   ├── lib/
│   │   ├── contracts.ts       # ABI, bytecode, адреса, хелперы ethers.js
│   │   └── networks.ts        # Конфиги 4 сетей, switchToNetwork()
│   ├── hooks/
│   │   └── use-toast.ts       # Toast-уведомления
│   ├── components/ui/         # shadcn/ui компоненты
│   ├── App.tsx                # Роутер: /login → /dashboard
│   ├── main.tsx
│   └── index.css              # Tailwind + CSS-переменные темы
├── contracts/
│   └── FakeToken.sol          # Solidity-исходник ERC-20 токена
├── public/
├── package.json
├── vite.config.ts
└── tailwind.config.ts
```

---

## 4. Поток данных

```
MetaMask (window.ethereum)
    │
    ▼
ethers.js Web3Provider / JsonRpcSigner
    │
    ├── getProvider()       → читает контракт (view calls)
    └── getSigner()         → подписывает транзакции
    
Dashboard (состояние)
    ├── wallet: string      → адрес кошелька
    ├── connected: bool     → MetaMask подключён
    ├── activeChainId       → текущая сеть MetaMask
    ├── selectedNetwork     → выбранная пользователем сеть
    └── txHistory[]         → история tx сессии (в памяти)
    
selectedNetwork передаётся пропом вниз:
    Deploy → getSignerOnNetwork() → switchToNetwork() → deploy
    WriteContract → getSigner() → contract.fn()
    QuickActions → getSigner() → contract.fn()
    ReadContract → getProvider() → contract.callStatic.fn()
```

---

## 5. Описание компонентов

### 5.1 Login.tsx
- При первом входе показывает форму "Initial Setup" — установить мастер-пароль
- Пароль хешируется SHA-256 и сохраняется в `localStorage`
- При повторном входе — сравнивает SHA-256
- После успешного входа: `sessionStorage.setItem("isAdminAuthenticated", "true")` + редирект на `/`
- Защита от брутфорса не реализована (только один пользователь)

### 5.2 Dashboard.tsx
- Главный layout: sidebar (56px) + header + content area
- Хранит состояние:
  - `selectedNetwork: NetworkConfig` — глобальная выбранная сеть
  - `txHistory: TxRecord[]` — список транзакций сессии
  - `wallet, connected, activeChainId`
- Слушает `window.ethereum` события: `accountsChanged`, `chainChanged`
- Сетевой переключатель: в сайдбаре (список 4 сетей) + dropdown в шапке
- Предупреждение `Wallet ≠ Selected` если MetaMask в другой сети
- Передаёт `selectedNetwork`, `onAddTx`, `onUpdateTx` во все дочерние компоненты

### 5.3 Deploy.tsx
- **Token Deployer** (верхняя карточка):
  - ERC-20 токен с параметрами: name, symbol, decimals, initialSupply, maxSupply
  - Bytecode скомпилирован заранее (`solc@0.8.26`), хранится как константа в `contracts.ts`
  - ABI FakeToken хранится в `ABIS["FakeToken"]`
  - Деплой через `ethers.ContractFactory`
  - Перед деплоем: `switchToNetwork(selectedNetwork)` → переключает MetaMask
  - Ссылка на эксплорер: `selectedNetwork.explorerAddr(address)`
- **Other Contracts** (карточки):
  - Escrow, Identity, Messaging — каждый со своим bytecode в `contracts.ts`
  - Та же логика `getSignerOnNetwork()` → деплой на выбранную сеть
  - Адреса сохраняются в `localStorage` через `saveDeployedAddress()`
- Кнопка всегда показывает: `Deploy → {selectedNetwork.shortName}`
- Красное предупреждение для mainnet

### 5.4 ReadContract.tsx
- Форма: адрес контракта + выбор ABI из списка
- Фильтрует только view/pure функции (`isViewFunction`)
- Вызывает `contract.callStatic[fn](...params)`
- Отображает результат (строка, число, bool, массив)
- Не требует подключения кошелька (read-only через provider)
- Пресеты быстрого вызова: балансы, адрес owner, и т.д.

### 5.5 WriteContract.tsx
- Форма: адрес + ABI + write-функции
- AlertDialog с подтверждением перед отправкой
- После отправки показывает txHash + ссылку: `selectedNetwork.explorerTx(hash)`
- Статусы: idle → pending → confirmed/failed

### 5.6 QuickActions.tsx
- **Derive & Set Admin Key**: подписывает сообщение "AliTerra Admin Key" приватным ключом, отправляет `setAdminKey(hash)` в Identity-контракт
- **Export Contract Events**: `getProvider().getLogs()` по фильтру и адресу
- **Check Contract Balance**: `getBalance(address)` через provider
- **Send Message**: вызов `sendMessage(recipient, text)` в Messaging-контракт

### 5.7 TxHistory.tsx
- Хранится только в памяти (сессия React-состояния в Dashboard)
- При перезагрузке — очищается
- Отображает: время, контракт, функция, txHash (с ссылкой), статус

---

## 6. networks.ts — Конфиги сетей

```typescript
interface NetworkConfig {
  id: string           // "polygon-mainnet" | "polygon-amoy" | "bsc-mainnet" | "bsc-testnet"
  name: string         // "Polygon Mainnet"
  shortName: string    // "Polygon"
  chainId: number      // 137
  chainHex: string     // "0x89"
  isTestnet: boolean
  currency: string     // "POL"
  rpcUrls: string[]
  blockExplorerUrl: string
  explorerTx(hash): string
  explorerAddr(addr): string
  dotClass: string     // Tailwind CSS-класс точки цвета
  badgeClass: string   // Tailwind CSS-классы бейджа
  addParams?: object   // Параметры wallet_addEthereumChain
}
```

**Сети:**
| ID | Chain | Тип | Валюта | Цвет |
|----|-------|-----|--------|------|
| polygon-mainnet | 137 | 🟢 Live | POL | purple |
| polygon-amoy | 80002 | 🟡 Test | MATIC | yellow |
| bsc-mainnet | 56 | 🟢 Live | BNB | amber |
| bsc-testnet | 97 | 🟠 Test | tBNB | orange |

`switchToNetwork(net)`:
1. `wallet_switchEthereumChain` → если сеть есть в MetaMask
2. При ошибке 4902 (сеть не добавлена) → `wallet_addEthereumChain`

---

## 7. contracts.ts — Ключевые хелперы

```typescript
getProvider()          → Web3Provider из window.ethereum (запрашивает разрешение)
getSigner()            → JsonRpcSigner текущего аккаунта
formatAddress(addr)    → "0x1234...abcd"
isViewFunction(sig)    → true если pure/view
saveDeployedAddress()  → localStorage
getDeployedAddress()   → localStorage
```

**Константы:**
- `CONTRACT_BYTECODES` — объект `{ EscrowContract: "0x...", IdentityContract: "0x...", ... }`
- `FAKETOKEN_BYTECODE` — длинная hex-строка (~7190 bytes)
- `ABIS` — объект с ABI-строками всех контрактов
- `KNOWN_CONTRACTS` — пресеты адресов для read/write

---

## 8. FakeToken.sol — Контракт токена

**Возможности:**
- ERC-20 стандарт (transfer, approve, allowance)
- EIP-2612 permit (подпись офчейн)
- Ownable (только владелец может mint/burn/blacklist/pause)
- Blacklist — блокировка адресов (transfer reverts)
- Pause — заморозка всех переводов
- Mint/Burn — управление эмиссией
- MaxSupply — ограничение общей эмиссии

**Конструктор:**
```solidity
constructor(
  string memory name,
  string memory symbol,
  uint8 decimals,
  uint256 initialSupply,
  uint256 maxSupply
)
```

**Компиляция:** `solc@0.8.26`, optimizer: 200 runs, EVM: paris  
**Размер:** ~7190 bytes bytecode

---

## 9. Известные ошибки и решения

### 9.1 `Module "buffer" has been externalized`
**Что:** Предупреждение в браузере от Vite — модуль Node.js `buffer` не доступен в браузере.  
**Причина:** ethers.js v5 внутри использует `Buffer` из Node.js.  
**Статус:** Косметическое, не ломает функциональность.  
**Решение (если нужно):** добавить `vite-plugin-node-polyfills` в `vite.config.ts`:
```typescript
import { nodePolyfills } from 'vite-plugin-node-polyfills'
plugins: [react(), nodePolyfills()]
```

### 9.2 GitHub push: "Bad credentials"
**Что:** При попытке пушить файлы через GitHub REST API напрямую с `settings.token` получали 401.  
**Причина:** Replit GitHub Connector не хранит токен в `settings` — он инжектируется проксью.  
**Решение:** Использовать `@replit/connectors-sdk` + `connectors.proxy("github", path, opts)`.  
```typescript
const { ReplitConnectors } = await import('@replit/connectors-sdk');
const connectors = new ReplitConnectors();
const res = await connectors.proxy('github', `/repos/owner/repo/contents/path`, { method: 'PUT', body: JSON.stringify(body) });
```

### 9.3 BNB контракт `0x7FD049EB478b7b216F23299A37bc57EbDf098888` — honeypot
**Что:** Анализ показал EIP-1167 minimal proxy с поддельным USDT (Unicode-символы в имени).  
**Механика:** Blacklist + pause делают невозможным вывод токенов покупателями.  
**Вывод:** Классическая схема honeypot scam-токена на BSC.

### 9.4 Сеть MetaMask не совпадает с выбранной
**Что:** Пользователь выбирает BSC Testnet в панели, но MetaMask остаётся на Polygon.  
**Решение:** При нажатии любой кнопки деплоя/транзакции автоматически вызывается `switchToNetwork()`. В шапке показывается бейдж `Wallet ≠ Selected`.

### 9.5 История транзакций не сохраняется между сессиями
**Что:** `txHistory` хранится в React-состоянии Dashboard → при перезагрузке пропадает.  
**Статус:** Намеренно (упрощение), приемлемо для MVP.  
**Решение при необходимости:** `localStorage` или `sessionStorage` сериализация.

### 9.6 Tailwind CSS v4 + shadcn/ui совместимость
**Что:** shadcn/ui изначально проектировался под Tailwind v3, конфигурация CSS-переменных отличается.  
**Решение:** Переменные темы (`--primary`, `--background`, etc.) определены вручную в `index.css` с нужными HSL-значениями под dark neon стиль.

---

## 10. Безопасность

| Риск | Уровень | Меры |
|------|---------|------|
| Утечка пароля | Низкий | SHA-256 hash в localStorage, пароль не хранится открыто |
| MITM | Низкий | 100% client-side, нет запросов к внешним API |
| Брутфорс пароля | Средний | Нет rate-limit (только один пользователь) |
| XSS | Низкий | React экранирует вывод, нет dangerouslySetInnerHTML |
| Приватный ключ | Н/П | Ключ никогда не покидает MetaMask |
| Mainnet ошибка | Средний | Предупреждения в UI, автоматического переключения нет |

---

## 11. Планы развития

### 11.1 Краткосрочные (следующий спринт)

- [ ] **Сохранение tx-истории** в `localStorage` между сессиями
- [ ] **Rate-limit входа** — блокировка после N попыток ввода пароля
- [ ] **Import ABI из JSON** — вставить произвольный ABI вместо выбора из списка
- [ ] **Ввод произвольного RPC** — кастомный RPC-URL для каждой сети
- [ ] **Копирование ABI** — кнопка скопировать ABI задеплоенного контракта

### 11.2 Среднесрочные

- [ ] **Контракт-анализатор** — автоопределение ABI через Etherscan/BscScan API по адресу
- [ ] **Мультисиг поддержка** — работа с Gnosis Safe через `SafeApiKit`
- [ ] **Batch-транзакции** — отправить несколько вызовов за одну транзакцию (multicall)
- [ ] **Gas estimator** — показывать стоимость транзакции до подтверждения
- [ ] **Event listener** — live-мониторинг событий контракта (WebSocket RPC)
- [ ] **Экспорт отчёта** — выгрузка tx-истории в CSV/JSON

### 11.3 Долгосрочные / архитектурные

- [ ] **Добавить сети** — Arbitrum One, Optimism, Base, Avalanche C-Chain
- [ ] **Multi-admin** — поддержка нескольких кошельков с разными правами
- [ ] **Шаблоны контрактов** — библиотека готовых контрактов: Vesting, NFT Drop, DAO, Staking
- [ ] **Верификация контракта** — автоматическая верификация на Etherscan/BscScan через API
- [ ] **Simulation mode** — режим симуляции транзакций через Tenderly/Foundry без реального газа
- [ ] **Proxy upgrade** — поддержка UUPS/TransparentUpgradeableProxy (upgrade контрактов)
- [ ] **Уведомления** — Telegram/email webhook при успешном деплое

---

## 12. Зависимости (package.json)

```json
{
  "dependencies": {
    "ethers": "^5.7.2",
    "react": "^18.x",
    "react-dom": "^18.x",
    "wouter": "^3.x",
    "@radix-ui/react-*": "shadcn/ui компоненты",
    "tailwindcss": "^4.x",
    "lucide-react": "иконки"
  },
  "devDependencies": {
    "vite": "^7.x",
    "typescript": "^5.x",
    "@vitejs/plugin-react": "^4.x"
  }
}
```

**Глобально (workspace root):**
- `@replit/connectors-sdk` — GitHub push через Replit proxy
- `solc@0.8.26` — компиляция Solidity контрактов

---

## 13. Команды для разработки

```bash
# Запуск панели в dev-режиме
pnpm --filter @workspace/contract-admin run dev

# Сборка production
pnpm --filter @workspace/contract-admin run build

# Компиляция нового Solidity контракта
node -e "
const solc = require('solc');
const fs = require('fs');
const src = fs.readFileSync('artifacts/contract-admin/contracts/MyContract.sol','utf8');
// ... compile and extract bytecode
"
```

---

## 14. GitHub репозиторий

**URL:** https://github.com/aliter230880/deploy_all  
**Branch:** `main`  
**Структура в репо:**
```
admin-panel/
├── src/
│   ├── lib/
│   │   ├── contracts.ts    ← ABI, bytecode, ethers helpers
│   │   └── networks.ts     ← 4 сети: Polygon/BSC mainnet+testnet
│   ├── pages/
│   │   ├── Login.tsx
│   │   └── Dashboard.tsx
│   └── components/
│       ├── Deploy.tsx
│       ├── ReadContract.tsx
│       ├── WriteContract.tsx
│       ├── QuickActions.tsx
│       └── TxHistory.tsx
└── contracts/
    └── FakeToken.sol
```

**Пуш через SDK:**
```javascript
const { ReplitConnectors } = await import('@replit/connectors-sdk');
const connectors = new ReplitConnectors();
await connectors.proxy('github', `/repos/aliter230880/deploy_all/contents/admin-panel/src/...`, {
  method: 'PUT',
  body: JSON.stringify({ message: 'update', content: base64Content, branch: 'main', sha }),
});
```
