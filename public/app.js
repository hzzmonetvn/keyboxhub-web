// State
let selectedFiles = [];
let allKeysData = [];
let currentFilter = "all";
let searchQuery = "";

// Internationalization (i18n) Dictionary
const translations = {
  vi: {
    notificationsNav: "Thông báo",
    notificationsTitle: "Webhook & Telegram",
    notificationsDesc: "Nhận tin khi có key mới, key bị ban hoặc đổi trạng thái.",
    notificationsAdmin: "Token truy cập",
    notificationsUnlock: "Mở cấu hình",
    notificationsAdminHelp: "Nhập token do admin cấp để lưu webhook hoặc Telegram của riêng bạn.",
    notificationsWebhookEnable: "Bật webhook",
    notificationsTelegramEnable: "Bật Telegram",
    notificationsWebhookToken: "Webhook token (tùy chọn)",
    notificationsHelp: "Để trống token để giữ token đã lưu. Test connection gửi tin thử theo các giá trị đang nhập, không lưu thay đổi. Tạo bot bằng @BotFather, nhắn /start hoặc thêm bot vào nhóm/kênh và cấp quyền gửi tin.",
    notificationsSave: "Lưu cấu hình",
    notificationsTest: "Test connection",
    notificationsSaved: "Đã lưu cấu hình. Thay đổi có hiệu lực ngay.",
    notificationsLoaded: "Đã mở cấu hình.",
    notificationsSecretSaved: "Đã lưu token — để trống để giữ nguyên",
    notificationsWorking: "Đang xử lý…",
    notificationsUnauthorized: "Token không đúng hoặc đã bị thu hồi.",
    notificationsNoChannels: "Hãy bật ít nhất một kênh trước khi kiểm tra kết nối.",
    notificationsTestSuccess: "Kết nối thành công",
    notificationsTestFailed: "Kết nối thất bại",
    notificationsAdminTitle: "Quản trị token",
    notificationsPassword: "Mật khẩu quản trị",
    notificationsLogin: "Đăng nhập",
    notificationsLogout: "Đăng xuất",
    notificationsSubscriberName: "Tên người nhận",
    notificationsIssue: "Cấp token",
    notificationsRevoke: "Thu hồi",
    notificationsRevokeConfirm: "Thu hồi token này và ngừng gửi thông báo cho người nhận?",
    notificationsTokenOnce: "Token chỉ hiển thị một lần. Sao chép và gửi cho người nhận.",
    notificationsCopyToken: "Sao chép token",
    notificationsCopied: "Đã sao chép token.",
    notificationsAdminUnauthorized: "Mật khẩu sai hoặc phiên đăng nhập đã hết hạn.",
    notificationsNoTokens: "Chưa cấp token nào.",
    tableScrollHint: "Vuốt ngang bảng để xem trạng thái và thao tác →",
    connectionError: "Mất kết nối",
    dropHelper: "XML hoặc ZIP · Hỗ trợ nhiều file",
    priorityNote: "Ưu tiên Strong Integrity, dự phòng Device.",
    fileDescription: "Android Attestation · Tệp chứng thực",
    statTotalHint: "Tất cả key trong hệ thống",
    statBannedHint: "Tự động xóa sau 24 giờ",
    statDeviceHint: "Dự phòng khi hết Strong",
    statStrongHint: "Ưu tiên cấp phát",
    scrollTable: "Bảng dữ liệu, cuộn ngang để xem thêm",
    chooseFiles: "Chọn file XML hoặc ZIP",
    skipContent: "Đến nội dung chính",
    viewDocs: "Tài liệu API",
    navSources: "Nguồn",
    navRepository: "Kho keybox",
    navOverview: "Tổng quan",
    pageIntro: "Theo dõi trạng thái. Chia sẻ keybox. Kết nối cộng đồng.",
    pageTitle: "Trung tâm Keybox",
    docTitle: "Keybox Play Integrity Hub & Attestation Engine",
    navSubtitle: "Play Integrity & Attestation Engine",
    navBtnLoot: "Quét nguồn",
    navBtnRefresh: "Làm mới",
    heroSubtitleText: "Trạng thái cấp phát hiện tại",
    statusChecking: "Đang kiểm tra...",
    heroConnecting: "Đang kết nối tới máy chủ Google Attestation và hệ thống quản lý keybox...",
    metaUpdated: "Cập nhật:",
    metaAutoLoot: "Quét nguồn:",
    metaCycle: "Chu kỳ:",
    metaCycleVal: "Mỗi giờ",
    statStrong: "Strong Integrity",
    statDevice: "Device Integrity",
    statBanned: "Đã thu hồi",
    statTotal: "Tổng keybox",
    downloadTitle: "Tải keybox",
    downloadDesc: "Nhận keybox khả dụng từ cộng đồng, sẵn sàng cho thiết bị của bạn.",
    downloadBtn: "Tải keybox.xml",
    copyXmlBtn: "Sao chép XML",
    apiHintDownload: "API cURL:",
    uploadTitle: "Đóng góp keybox",
    uploadDesc: "Chia sẻ keybox của bạn. Tự động kiểm tra chứng chỉ và bỏ qua file trùng lặp.",
    tabFile: "Tải file",
    tabUrl: "Từ URL",
    tabText: "Dán XML",
    dropText: "Kéo thả file vào đây hoặc",
    browseText: "chọn từ thiết bị",
    urlPlaceholder: "https://raw.githubusercontent.com/.../keybox.xml hoặc link Pastebin...",
    urlHelperText: "Hệ thống sẽ tải file từ link, tự động nhận diện định dạng (XML/Base64/Specter Scrambled) và xác thực với Google.",
    xmlPlaceholder: "Dán nội dung XML của keybox tại đây (<AndroidAttestation>...)",
    btnUploadSubmit: "Kiểm tra & tải lên",
    resultTitle: "Kết Quả Kiểm Tra Chi Tiết",
    tableTitle: "Kho keybox",
    tableSubtitle: "Tìm và tải keybox theo trạng thái. Key bị thu hồi được giữ lại trong 24 giờ.",
    searchPlaceholder: "Tìm ID, thiết bị, nguồn…",
    filterAll: "Tất cả",
    btnCheckAll: "Kiểm tra toàn bộ",
    thId: "ID",
    thDevice: "Device ID",
    thSerial: "Số Serial",
    thAlg: "Thuật toán",
    thStatus: "Trạng thái",
    thSource: "Nguồn gốc",
    thReport: "Báo cáo",
    thUploaded: "Tải lên lúc",
    thPurge: "Thời gian xóa",
    thActions: "Thao tác",
    badgeSoftban: "Device (Softban)",
    badgeSoftbanTip: "Bị Google Softban theo Specter Catalog (không đạt STRONG)",
    loadingKeys: "Đang tải danh sách keybox...",
    sourcesTitle: "Nguồn cộng đồng",
    sourcesDesc: "Tự động quét mỗi giờ. Nhận cả key Strong & Device, tự động bỏ qua key trùng lặp.",
    btnLootNowTable: "Quét nguồn ngay",
    inputSourceUrlPlaceholder: "Nhập link nguồn mới (VD: https://raw.githubusercontent.com/.../keybox.xml)",
    inputSourceNamePlaceholder: "Tên nguồn (tùy chọn)",
    btnAddSource: "Thêm & quét",
    thSrcName: "Nguồn",
    thSrcType: "Loại",
    thSrcUrl: "Địa chỉ URL",
    thSrcStatus: "Trạng thái quét",
    thSrcLast: "Lần quét gần nhất",
    loadingSources: "Đang tải danh sách nguồn...",
    apiDocsTitle: "Tích hợp theo cách của bạn",
    apiDocsDesc: "Kết nối Keybox Hub với script, module Magisk hoặc KernelSU qua REST API.",
    apiDescDownload: "Tải ngẫu nhiên 1 file keybox.xml khả dụng (Ưu tiên Strong → Device)",
    apiDescLoot: "Kích hoạt fetch nguồn bên thứ 3 và tự động loot key Strong & Device (bỏ qua trùng)",
    apiDescUpload: "Upload đơn lẻ, nhiều file, ZIP hoặc qua link URL (Tự bỏ qua trùng lặp)",
    apiDescStatus: "Kiểm tra trạng thái hệ thống (strong / device / banned)",
    apiDescReport: "Báo cáo key bị hạ cấp xuống Device (trên 5 phiếu chuyển sang device)",
    footerText: "Powered by KeyBoxChecker · Kiểm tra CRL & quét nguồn mỗi giờ · Xóa key thu hồi sau 24 giờ",
    btnCopy: "Copy",
    btnDownloadRow: "Tải",
    btnReportDevice: "Báo Device",
    normalStatus: "Bình thường",
    purgeIn: "Xóa sau ~",
    pendingPurge: "Đang chờ xóa",
    aboutToPurge: "Sắp bị xóa",
    noValidKey: "Không Có Key Khả Dụng",
    noKeysFound: "Không tìm thấy keybox nào phù hợp với bộ lọc hiện tại.",
    noKeysInDb: "Kho keybox đang trống. Hãy đóng góp file hoặc quét nguồn cộng đồng.",
    copiedXmlToast: "Đã sao chép mã XML của Keybox vào Clipboard!",
    copiedIdToast: "Đã sao chép: ",
    connError: "Lỗi kết nối tới máy chủ",
    reportConfirm: "Bạn có chắc chắn muốn báo cáo Keybox #",
    reportConfirmSuffix: " đã bị hạ cấp xuống Device Integrity? (Khi đủ trên 5 báo cáo, keybox sẽ tự động chuyển trạng thái)",
    reportSuccess: "Báo cáo thành công!",
    lootFinishedToast: "Hoàn tất Loot nguồn bên thứ 3!",
    lootAddedText: "Thêm mới:",
    lootSkippedText: "Bỏ qua:",
    recheckedGoogleToast: "Đã kiểm tra lại toàn bộ với Google!",
    statusStrongDesc: "Keybox Strong Integrity đang sẵn sàng. Yêu cầu tải xuống sẽ được ưu tiên cấp key Strong.",
    statusDeviceDesc: "Hiện không có key Strong. Bạn vẫn có thể tải keybox Device Integrity.",
    statusBannedDesc: "Chưa có keybox khả dụng. Đóng góp keybox hoặc quét nguồn cộng đồng để cập nhật.",
    selectFilePrompt: "Vui lòng chọn file XML hoặc ZIP trước!",
    enterXmlPrompt: "Vui lòng nhập nội dung XML!",
    enterUrlPrompt: "Vui lòng nhập đường link URL của keybox!",
    checkingGoogle: "Đang kiểm tra với Google...",
    uploadSuccess: "Tải lên thành công!",
    uploadFailed: "Xác thực không thành công",
    addingSource: "Đang Thêm & Quét...",
    navRepair: "Sửa lỗi keybox",
    repairTitle: "Sửa Lỗi & Chuẩn Hóa Keybox",
    repairDesc: "Tự động sửa lỗi cấu trúc, sắp xếp chuỗi Leaf → Intermediate → Root, bổ sung Google Root CA còn thiếu, chuyển đổi SEC1/PKCS#1, ngắt dòng 64 ký tự chuẩn RFC để tương thích 100% với TrickyStore, APatch, KernelSU, Chiteroman PIF.",
    repairTabUpload: "Tải File (XML / TXT)",
    repairTabPaste: "Dán Mã XML / PEM",
    repairDropText: "Kéo thả file keybox bị lỗi vào đây",
    btnRepairSubmit: "Sửa Lỗi & Chuẩn Hóa Ngay",
    repairSuccessBadge: "Đã Chuẩn Hóa Thành Công",
    repairAppliedTitle: "Các lỗi đã được tự động xử lý:",
    repairPreviewTitle: "Keybox Đã Chuẩn Hóa (keybox.xml)",
    downloadRepairedBtn: "Tải keybox.xml Đã Sửa",
    apiDescRepair: "Sửa lỗi & chuẩn hóa keybox (sắp xếp chuỗi cert, bổ sung Google Root, ngắt dòng 64 ký tự PEM)",
    repairingStatus: "Đang sửa lỗi & chuẩn hóa...",
    repairSuccessToast: "Keybox đã được sửa lỗi & chuẩn hóa thành công!",
    repairNoContentPrompt: "Vui lòng chọn file hoặc dán nội dung keybox cần sửa lỗi!"
  },
  en: {
    notificationsNav: "Notifications",
    notificationsTitle: "Webhook & Telegram",
    notificationsDesc: "Get notified about new keys, banned keys and status changes.",
    notificationsAdmin: "Access token",
    notificationsUnlock: "Open settings",
    notificationsAdminHelp: "Enter an admin-issued token to save your own webhook or Telegram settings.",
    notificationsWebhookEnable: "Enable webhook",
    notificationsTelegramEnable: "Enable Telegram",
    notificationsWebhookToken: "Webhook token (optional)",
    notificationsHelp: "Leave tokens blank to keep saved tokens. Test connection sends a test message using the current inputs without saving changes. Create a bot with @BotFather, send /start or add it to your group/channel and allow it to send messages.",
    notificationsSave: "Save settings",
    notificationsTest: "Test connection",
    notificationsSaved: "Settings saved. Changes take effect immediately.",
    notificationsLoaded: "Settings unlocked.",
    notificationsSecretSaved: "Token saved — leave blank to keep it",
    notificationsWorking: "Working…",
    notificationsUnauthorized: "Invalid or revoked access token.",
    notificationsNoChannels: "Enable at least one channel before testing the connection.",
    notificationsTestSuccess: "Connection successful",
    notificationsTestFailed: "Connection failed",
    notificationsAdminTitle: "Manage access tokens",
    notificationsPassword: "Admin password",
    notificationsLogin: "Log in",
    notificationsLogout: "Log out",
    notificationsSubscriberName: "Recipient name",
    notificationsIssue: "Issue token",
    notificationsRevoke: "Revoke",
    notificationsRevokeConfirm: "Revoke this token and stop notifications for this recipient?",
    notificationsTokenOnce: "This token is shown only once. Copy it and share it with the recipient.",
    notificationsCopyToken: "Copy token",
    notificationsCopied: "Token copied.",
    notificationsAdminUnauthorized: "Invalid password or expired admin session.",
    notificationsNoTokens: "No tokens issued yet.",
    tableScrollHint: "Swipe across the table for status and actions →",
    connectionError: "Connection lost",
    dropHelper: "XML or ZIP · Multiple files supported",
    priorityNote: "Strong Integrity first, Device as a fallback.",
    fileDescription: "Android Attestation · Certificate file",
    statTotalHint: "All keys in the repository",
    statBannedHint: "Automatically purged after 24h",
    statDeviceHint: "Fallback when Strong runs out",
    statStrongHint: "First in download priority",
    scrollTable: "Data table, scroll horizontally for more",
    chooseFiles: "Choose XML or ZIP files",
    skipContent: "Skip to main content",
    viewDocs: "API documentation",
    navSources: "Sources",
    navRepository: "Repository",
    navOverview: "Overview",
    pageIntro: "Monitor integrity. Share keyboxes. Stay connected.",
    pageTitle: "Your keybox workspace",
    docTitle: "Keybox Play Integrity Hub & Attestation Engine",
    navSubtitle: "Play Integrity & Attestation Engine",
    navBtnLoot: "Scan sources",
    navBtnRefresh: "Refresh",
    heroSubtitleText: "Current Allocation Status",
    statusChecking: "Checking...",
    heroConnecting: "Connecting to Google Attestation server and keybox repository...",
    metaUpdated: "Updated:",
    metaAutoLoot: "Sources:",
    metaCycle: "Cycle:",
    metaCycleVal: "Every hour",
    statStrong: "Strong Integrity",
    statDevice: "Device Integrity",
    statBanned: "Revoked",
    statTotal: "Total keyboxes",
    downloadTitle: "Download a keybox",
    downloadDesc: "Get an available keybox from the community, ready for your device.",
    downloadBtn: "Download keybox.xml",
    copyXmlBtn: "Copy XML",
    apiHintDownload: "API cURL:",
    uploadTitle: "Contribute a keybox",
    uploadDesc: "Share your keybox. Certificates are checked and duplicates are skipped automatically.",
    tabFile: "Upload file",
    tabUrl: "From URL",
    tabText: "Paste XML",
    dropText: "Drag and drop your files here or",
    browseText: "browse your device",
    urlPlaceholder: "https://raw.githubusercontent.com/.../keybox.xml or Pastebin raw URL...",
    urlHelperText: "System will fetch the file from link, auto-detect encoding (XML/Base64/Specter Scrambled) and verify with Google.",
    xmlPlaceholder: "Paste keybox XML content here (<AndroidAttestation>...)",
    btnUploadSubmit: "Verify & upload",
    resultTitle: "Detailed Verification Result",
    tableTitle: "Keybox repository",
    tableSubtitle: "Find and download keys by status. Revoked keys remain visible for 24 hours.",
    searchPlaceholder: "Search ID, device, source…",
    filterAll: "All",
    btnCheckAll: "Recheck all keys",
    thId: "ID",
    thDevice: "Device ID",
    thSerial: "Serial Number",
    thAlg: "Algorithm",
    thStatus: "Status",
    thSource: "Source",
    thReport: "Reports",
    thUploaded: "Uploaded At",
    thPurge: "Purge time",
    thActions: "Actions",
    badgeSoftban: "Device (Softban)",
    badgeSoftbanTip: "Softbanned by Google according to Specter Catalog (cannot pass STRONG)",
    loadingKeys: "Loading keybox database...",
    sourcesTitle: "Community sources",
    sourcesDesc: "Scanned every hour. Imports both Strong & Device keys, skips duplicates automatically.",
    btnLootNowTable: "Scan sources now",
    inputSourceUrlPlaceholder: "Enter new source link (e.g. https://raw.githubusercontent.com/.../keybox.xml)",
    inputSourceNamePlaceholder: "Source name (optional)",
    btnAddSource: "Add & scan",
    thSrcName: "Source",
    thSrcType: "Type",
    thSrcUrl: "URL Address",
    thSrcStatus: "Scan Status",
    thSrcLast: "Last Scanned",
    loadingSources: "Loading sources list...",
    apiDocsTitle: "Build it into your workflow",
    apiDocsDesc: "Connect Keybox Hub to your scripts, Magisk or KernelSU modules with the REST API.",
    apiDescDownload: "Download a random valid keybox.xml (Strong → Device priority)",
    apiDescLoot: "Trigger 3rd-party source fetch and auto-loot Strong & Device keys (skip duplicates)",
    apiDescUpload: "Upload single, multiple files, ZIP or via direct URL link (skips duplicates)",
    apiDescStatus: "Check system status (strong / device / banned)",
    apiDescReport: "Report key downgraded to Device (promoted to device upon >5 votes)",
    footerText: "Powered by KeyBoxChecker · Hourly CRL checks & source scans · Revoked keys purged after 24h",
    btnCopy: "Copy",
    btnDownloadRow: "Download",
    btnReportDevice: "Report Device",
    normalStatus: "Normal",
    purgeIn: "Purge in ~",
    pendingPurge: "Pending purge",
    aboutToPurge: "Purging soon",
    noValidKey: "No Keys Available",
    noKeysFound: "No keyboxes match the current filter.",
    noKeysInDb: "Your repository is empty. Contribute a file or scan community sources to get started.",
    copiedXmlToast: "Keybox XML copied to clipboard!",
    copiedIdToast: "Copied: ",
    connError: "Server connection error",
    reportConfirm: "Are you sure you want to report Keybox #",
    reportConfirmSuffix: " as degraded to Device Integrity? (Promotes to Device upon >5 reports)",
    reportSuccess: "Report submitted successfully!",
    lootFinishedToast: "3rd-party auto-loot cycle finished!",
    lootAddedText: "Looted:",
    lootSkippedText: "Duplicates Skipped:",
    recheckedGoogleToast: "Full database rechecked with Google!",
    statusStrongDesc: "Strong Integrity keyboxes are ready. Downloads will prioritize available Strong keys.",
    statusDeviceDesc: "No Strong keys are available right now. You can still download a Device Integrity keybox.",
    statusBannedDesc: "No keyboxes are available. Contribute a keybox or scan community sources to get started.",
    selectFilePrompt: "Please select an XML or ZIP file first!",
    enterXmlPrompt: "Please enter XML content!",
    enterUrlPrompt: "Please enter keybox URL link!",
    checkingGoogle: "Verifying with Google...",
    uploadSuccess: "Uploaded successfully!",
    uploadFailed: "Verification failed",
    addingSource: "Adding & Scanning...",
    navRepair: "Repair Keybox",
    repairTitle: "Keybox Repair & Standardization Engine",
    repairDesc: "Automatically fixes XML syntax, reorders certificate chains (Leaf → Intermediate → Root), appends missing Google Attestation Root CA, converts to SEC1/PKCS#1, and wraps PEM lines to standard 64 characters for 100% compatibility with TrickyStore, APatch, KernelSU, and Chiteroman PIF.",
    repairTabUpload: "Upload File (XML / TXT)",
    repairTabPaste: "Paste XML / PEM",
    repairDropText: "Drag and drop corrupted keybox file here",
    btnRepairSubmit: "Repair & Standardize Now",
    repairSuccessBadge: "Standardized & Repaired",
    repairAppliedTitle: "Automated Fixes Applied:",
    repairPreviewTitle: "Canonical Keybox Output (keybox.xml)",
    downloadRepairedBtn: "Download Repaired keybox.xml",
    apiDescRepair: "Repair & standardize keybox (reorder chain, append Google Root, wrap 64-char PEM lines)",
    repairingStatus: "Repairing & standardizing...",
    repairSuccessToast: "Keybox repaired and standardized successfully!",
    repairNoContentPrompt: "Please choose a file or paste keybox content to repair!"
  }
};

let currentLang = localStorage.getItem("keybox_lang") || (navigator.language?.startsWith("vi") ? "vi" : "en");

function t(key) {
  return translations[currentLang]?.[key] || translations.vi[key] || key;
}

function applyLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("keybox_lang", lang);
  document.documentElement.lang = lang;

  // Update button label
  const langLabel = document.getElementById("lang-label");
  if (langLabel) {
    langLabel.textContent = lang === "vi" ? "EN" : "VI";
  }

  // Update all elements with data-i18n
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (translations[lang]?.[key]) {
      el.innerHTML = translations[lang][key];
    }
  });

  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  [['btn-refresh', 'navBtnRefresh'], ['btn-loot-now', 'navBtnLoot'], ['btn-loot-table', 'btnLootNowTable'], ['btn-check-now', 'btnCheckAll']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    el.title = t(key);
    el.setAttribute('aria-label', t(key));
  });

  // Update inputs with placeholder
  const searchInput = document.getElementById("table-search-input");
  if (searchInput) searchInput.placeholder = t("searchPlaceholder");

  const urlInput = document.getElementById("keybox-url-input");
  if (urlInput) urlInput.placeholder = t("urlPlaceholder");

  const xmlInput = document.getElementById("xml-text-input");
  if (xmlInput) xmlInput.placeholder = t("xmlPlaceholder");

  const newSourceUrl = document.getElementById("input-new-source-url");
  if (newSourceUrl) newSourceUrl.placeholder = t("inputSourceUrlPlaceholder");

  const newSourceName = document.getElementById("input-new-source-name");
  if (newSourceName) newSourceName.placeholder = t("inputSourceNamePlaceholder");

  // Re-render UI
  loadStatus();
  renderKeysTable();
  loadSources();
  renderNotificationSubscribers();
}

// Toast Notification Utility
function showToast(message, type = "info", duration = 3800) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let iconSvg = '';
  if (type === "success") {
    iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === "error") {
    iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f43f5e" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  } else {
    iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#38bdf8" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `
    <div style="flex-shrink:0; display:flex; align-items:center;">${iconSvg}</div>
    <div style="flex:1; line-height:1.4;">${message}</div>
    <button style="background:transparent; border:none; color:var(--text-dim); cursor:pointer; font-size:1.1rem; line-height:1; padding:2px;" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Elements
const systemStatusBadge = document.getElementById("system-status-badge");
const systemStatusText = document.getElementById("system-status-text");
const systemStatusDesc = document.getElementById("system-status-desc");
const lastUpdatedTime = document.getElementById("last-updated-time");
const lastLootedTime = document.getElementById("last-looted-time");

const statStrong = document.getElementById("stat-strong");
const statDevice = document.getElementById("stat-device");
const statBanned = document.getElementById("stat-banned");
const statTotal = document.getElementById("stat-total");

const keysTableBody = document.getElementById("keys-table-body");
const sourcesTableBody = document.getElementById("sources-table-body");
const tableSearchInput = document.getElementById("table-search-input");
const filterPills = document.querySelectorAll(".filter-pill");

const btnLangToggle = document.getElementById("btn-lang-toggle");
const btnRefresh = document.getElementById("btn-refresh");
const btnCheckNow = document.getElementById("btn-check-now");
const btnCopyXml = document.getElementById("btn-copy-xml");
const btnLootNow = document.getElementById("btn-loot-now");
const btnLootTable = document.getElementById("btn-loot-table");

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const fileNameDisplay = document.getElementById("file-name-display");
const xmlTextInput = document.getElementById("xml-text-input");
const keyboxUrlInput = document.getElementById("keybox-url-input");
const btnSubmitUpload = document.getElementById("btn-submit-upload");
const uploadStatus = document.getElementById("upload-status");

const inputNewSourceUrl = document.getElementById("input-new-source-url");
const inputNewSourceName = document.getElementById("input-new-source-name");
const btnSubmitSource = document.getElementById("btn-submit-source");

const analysisResultPanel = document.getElementById("analysis-result-panel");
const analysisResultBody = document.getElementById("analysis-result-body");
const btnCloseResult = document.getElementById("btn-close-result");

// Language switcher toggle
if (btnLangToggle) {
  btnLangToggle.addEventListener("click", () => {
    const nextLang = currentLang === "vi" ? "en" : "vi";
    applyLanguage(nextLang);
    showToast(nextLang === "en" ? "Switched to English" : "Đã chuyển sang Tiếng Việt", "info", 2000);
  });
}

// Tab switching
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = {
  file: document.getElementById("tab-file"),
  text: document.getElementById("tab-text"),
  url: document.getElementById("tab-url")
};

let activeTab = "file";

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => {
      b.classList.remove("active");
      b.setAttribute('aria-selected', 'false');
      b.tabIndex = -1;
    });
    btn.setAttribute('aria-selected', 'true');
    btn.tabIndex = 0;
    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    
    Object.keys(tabContents).forEach(k => {
      if (k === activeTab) {
        tabContents[k]?.classList.remove("hidden");
      } else {
        tabContents[k]?.classList.add("hidden");
      }
    });
  });
});

tabButtons.forEach((btn, index) => {
  btn.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabButtons.length;
    if (event.key === 'ArrowLeft') next = (index + tabButtons.length - 1) % tabButtons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabButtons.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    tabButtons[next].focus();
    tabButtons[next].click();
  });
});

// Format timestamp
function formatTime(isoString) {
  if (!isoString) return "---";
  try {
    const d = new Date(isoString);
    const locale = currentLang === "vi" ? "vi-VN" : "en-US";
    return d.toLocaleString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch {
    return isoString;
  }
}

// Calculate remaining time before 24h deletion
function formatRemainingBannedTime(bannedAtIso) {
  if (!bannedAtIso) return t("pendingPurge");
  const bannedTime = new Date(bannedAtIso).getTime();
  const deleteTime = bannedTime + 24 * 60 * 60 * 1000;
  const now = Date.now();
  const diffMs = deleteTime - now;

  if (diffMs <= 0) return t("aboutToPurge");
  const hours = Math.floor(diffMs / (3600 * 1000));
  const mins = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
  return `${t("purgeIn")}${hours}h ${mins}m`;
}

// Fetch and render System Status
async function loadStatus() {
  try {
    const res = await fetch("/api/status?ts=" + Date.now(), {
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    systemStatusBadge.className = `status-badge status-${data.status}`;
    systemStatusText.textContent = data.status.toUpperCase();

    if (data.status === "strong") {
      systemStatusDesc.textContent = t("statusStrongDesc");
    } else if (data.status === "device") {
      systemStatusDesc.textContent = t("statusDeviceDesc");
    } else {
      systemStatusDesc.textContent = t("statusBannedDesc");
    }

    lastUpdatedTime.textContent = formatTime(data.last_updated);
    if (lastLootedTime) {
      lastLootedTime.textContent = data.last_looted_at ? formatTime(data.last_looted_at) : "---";
    }

    statStrong.textContent = data.strong_count || 0;
    statDevice.textContent = data.device_count || 0;
    statBanned.textContent = data.banned_count || 0;
    statTotal.textContent = data.total_keys || 0;

    const btnDownloadMain = document.getElementById("btn-download-main");
    if (data.total_valid === 0) {
      btnDownloadMain.classList.add("disabled");
      btnDownloadMain.setAttribute('aria-disabled', 'true');
      btnDownloadMain.removeAttribute('href');
      btnCopyXml.disabled = true;
      btnDownloadMain.style.opacity = "0.5";
      btnDownloadMain.style.pointerEvents = "none";
      btnDownloadMain.textContent = t("noValidKey");
    } else {
      btnDownloadMain.classList.remove("disabled");
      btnDownloadMain.setAttribute('aria-disabled', 'false');
      btnDownloadMain.href = '/api/download';
      btnCopyXml.disabled = false;
      btnDownloadMain.style.opacity = "1";
      btnDownloadMain.style.pointerEvents = "auto";
      const countLabel = data.strong_count > 0 
        ? ` (${data.strong_count} Strong)` 
        : ` (${data.device_count} Device)`;
      btnDownloadMain.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        ${t("downloadBtn")}${countLabel}
      `;
    }
  } catch (err) {
    console.error("Error loading status:", err);
    systemStatusBadge.className = 'status-badge status-error';
    systemStatusText.textContent = t('connectionError');
    systemStatusDesc.textContent = t("connError") + ": " + err.message;
  }
}

// Render Keybox Table with filter and search
function renderKeysTable() {
  if (!keysTableBody) return;

  const filtered = allKeysData.filter(k => {
    if (currentFilter !== "all" && k.status !== currentFilter) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const dev = (k.device_id || "").toLowerCase();
      const alg = (k.algorithm || "").toLowerCase();
      const id = String(k.id);
      const src = (k.source || "").toLowerCase();
      const serial = (k.primary_serial || (k.serials && k.serials.join(" ")) || "").toLowerCase();
      if (!dev.includes(q) && !alg.includes(q) && !id.includes(q) && !src.includes(q) && !serial.includes(q)) {
        return false;
      }
    }
    return true;
  });

  document.getElementById('keys-count').textContent = `${filtered.length} / ${allKeysData.length}`;
  if (filtered.length === 0) {
    const emptyMsg = allKeysData.length === 0 ? t("noKeysInDb") : t("noKeysFound");
    keysTableBody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-4" style="color:var(--text-dim);">${emptyMsg}</td>
      </tr>
    `;
    return;
  }

  keysTableBody.innerHTML = filtered.map(k => {
    const isStrong = k.status === "strong";
    const isDevice = k.status === "device";
    const isBanned = k.status === "banned";
    const badgeClass = isStrong ? "badge-strong" : (isDevice ? "badge-device" : "badge-banned");

    let statusBadge = `<span class="badge-tag ${badgeClass}">${k.status}</span>`;
    if (k.is_softbanned) {
      statusBadge = `<span class="badge-tag badge-softban" title="${t("badgeSoftbanTip")}">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:2px; vertical-align:text-top;">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        ${t("badgeSoftban")}
      </span>`;
    }

    let noteHtml = `<span style="color:var(--text-dim);">${t("normalStatus")}</span>`;
    if (isBanned) {
      noteHtml = `<span class="text-danger" title="${formatTime(k.banned_at)}">${formatRemainingBannedTime(k.banned_at)}</span>`;
    }

    let sourceBadge = `<span class="badge-tag badge-device">${k.source || "User"}</span>`;
    if (k.source?.includes("Specter")) {
      sourceBadge = `<span class="badge-tag badge-strong" title="${k.source}">${k.source}</span>`;
    } else if (k.source?.startsWith("http")) {
      sourceBadge = `<span class="badge-tag badge-device" title="${k.source}">URL Link</span>`;
    }

    const fullSerial = k.primary_serial || (k.serials && k.serials[0]) || "";
    const shortSerial = fullSerial.length > 16 
      ? `${fullSerial.slice(0, 8)}…${fullSerial.slice(-6)}` 
      : (fullSerial || "—");

    const serialCell = fullSerial ? `
      <td>
        <div style="display:flex; align-items:center; gap:6px;">
          <code style="font-size:0.75rem;" title="${fullSerial}">${shortSerial}</code>
          <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:0.7rem;" title="Copy Serial" onclick="copyText('${fullSerial}')">
            ${t("btnCopy")}
          </button>
        </div>
      </td>
    ` : `<td><span style="color:var(--text-dim);">—</span></td>`;

    return `
      <tr>
        <td><strong>#${k.id}</strong></td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <span title="${k.device_id}"><strong>${k.device_id || "N/A"}</strong></span>
            <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:0.7rem;" title="Copy Device ID" onclick="copyText('${k.device_id}')">
              ${t("btnCopy")}
            </button>
          </div>
        </td>
        ${serialCell}
        <td><code>${k.algorithm || "rsa"}</code></td>
        <td>${statusBadge}</td>
        <td><small>${sourceBadge}</small></td>
        <td>
          <span>${k.report_count} / 5</span>
          ${k.report_count > 5 ? '<small class="text-warning"> (Device)</small>' : ''}
        </td>
        <td><small>${formatTime(k.uploaded_at)}</small></td>
        <td><small>${noteHtml}</small></td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <a href="/api/download?id=${k.id}" class="btn btn-secondary btn-sm" download="keybox_${k.id}.xml" title="Download XML">
              ${t("btnDownloadRow")}
            </a>
            <button class="btn btn-secondary btn-sm" onclick="copyKeyXml(${k.id})" title="Copy XML to Clipboard">
              XML
            </button>
            ${k.status === "strong" ? `
              <button class="btn btn-danger-outline btn-sm" onclick="reportKey(${k.id})" title="Report key as Device Integrity">
                ${t("btnReportDevice")}
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Fetch Key list from server
async function loadKeys() {
  try {
    const res = await fetch("/api/keys?ts=" + Date.now(), {
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    allKeysData = (data.keys || []).filter(k => k.status !== "banned");
    renderKeysTable();
  } catch (err) {
    console.error("Error loading keys:", err);
    keysTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-4 text-danger">${t("connError")}: ${err.message}</td>
      </tr>
    `;
  }
}

// Filter pills interaction
filterPills.forEach(pill => {
  pill.setAttribute("aria-pressed", String(pill.classList.contains("active")));
  pill.addEventListener("click", () => {
    filterPills.forEach(p => { p.classList.remove("active"); p.setAttribute('aria-pressed', 'false'); });
    pill.setAttribute('aria-pressed', 'true');
    pill.classList.add("active");
    currentFilter = pill.dataset.filter;
    renderKeysTable();
  });
});

// Search input interaction
if (tableSearchInput) {
  tableSearchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    renderKeysTable();
  });
}

// Fetch and render 3rd-party Sources
async function loadSources() {
  const tbody = document.getElementById("sources-table-body");
  if (!tbody) return;
  try {
    const res = await fetch("/api/sources?ts=" + Date.now(), {
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const sources = data.sources || [];

    if (sources.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3" style="color:var(--text-dim);">${currentLang === "vi" ? "Chưa cấu hình nguồn nào." : "No sources configured."}</td></tr>`;
      return;
    }

    tbody.innerHTML = sources.map(s => `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td><code>${s.type}</code></td>
        <td><small><a href="${s.url}" target="_blank" rel="noopener" style="color:var(--text-muted); word-break:break-all;">${s.url}</a></small></td>
        <td><small class="${s.last_status?.includes('OK') ? 'text-success' : 'text-dim'}">${s.last_status || '---'}</small></td>
        <td><small>${formatTime(s.last_fetched_at)}</small></td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Could not load sources:", err);
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">${t("connError")}: ${err.message}</td></tr>`;
  }
}

// Copy plain text utility
window.copyText = function(text) {
  if (!text) return;
  navigator.clipboard.writeText(text)
    .then(() => showToast(`${t("copiedIdToast")}"${text}"`, "success"))
    .catch(() => showToast(currentLang === "vi" ? "Không thể sao chép văn bản" : "Failed to copy text", "error"));
};

// Copy XML of a specific key
window.copyKeyXml = async function(id) {
  try {
    const res = await fetch(`/api/download?id=${id}&format=json`);
    if (!res.ok) throw new Error("Keybox not found");
    const data = await res.json();
    if (!data.xml) throw new Error("XML content empty");
    await navigator.clipboard.writeText(data.xml);
    showToast(currentLang === "vi" ? `Đã sao chép mã XML của Keybox #${id}!` : `Copied XML for Keybox #${id}!`, "success");
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
};

// Add new 3rd party source
if (btnSubmitSource) {
  btnSubmitSource.addEventListener("click", async () => {
    const url = inputNewSourceUrl.value.trim();
    const name = inputNewSourceName.value.trim();

    if (!url) {
      showToast(currentLang === "vi" ? "Vui lòng nhập đường link URL nguồn!" : "Please enter source URL link!", "error");
      return;
    }

    btnSubmitSource.disabled = true;
    btnSubmitSource.textContent = t("addingSource");

    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name })
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message, "success", 5000);
        inputNewSourceUrl.value = "";
        inputNewSourceName.value = "";
        await loadSources();
        await loadStatus();
        await loadKeys();
      } else {
        showToast("Error: " + (data.error || "Failed to add source"), "error");
      }
    } catch (err) {
      showToast(t("connError") + ": " + err.message, "error");
    } finally {
      btnSubmitSource.disabled = false;
      btnSubmitSource.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>${t("btnAddSource")}</span>
      `;
    }
  });
}

// Report Keybox
window.reportKey = async function(id) {
  if (!confirm(`${t("reportConfirm")}${id}${t("reportConfirmSuffix")}`)) {
    return;
  }

  try {
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message || t("reportSuccess"), "success");
      await loadStatus();
      await loadKeys();
    } else {
      showToast(data.error || "Failed to submit report.", "error");
    }
  } catch (err) {
    showToast(t("connError") + ": " + err.message, "error");
  }
};

// Trigger 3rd Party Loot
async function triggerLoot() {
  const btn = btnLootNow || btnLootTable;
  const originalText = btn ? btn.innerHTML : "";
  if (btnLootNow) { btnLootNow.disabled = true; btnLootNow.textContent = "..."; }
  if (btnLootTable) { btnLootTable.disabled = true; btnLootTable.textContent = "..."; }

  try {
    const res = await fetch("/api/loot", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      const lr = data.lootResult;
      const msg = currentLang === "vi"
        ? `Hoàn tất Loot nguồn bên thứ 3! Thêm mới: ${lr.looted_count} key Strong, Bỏ qua: ${lr.skipped_duplicate_count} key trùng lặp.`
        : `3rd-party loot cycle finished! Looted: ${lr.looted_count} new Strong keys, Skipped: ${lr.skipped_duplicate_count} duplicates.`;
      showToast(msg, "success", 5000);
      await loadStatus();
      await loadKeys();
      await loadSources();
    } else {
      showToast("Error: " + (data.error || "Unknown"), "error");
    }
  } catch (err) {
    showToast(t("connError") + ": " + err.message, "error");
  } finally {
    if (btnLootNow) { 
      btnLootNow.disabled = false; 
      btnLootNow.innerHTML = `
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2.2" fill="none">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        <span class="btn-label">${t("navBtnLoot")}</span>
      `; 
    }
    if (btnLootTable) { 
      btnLootTable.disabled = false; 
      btnLootTable.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        <span class="btn-label">${t("btnLootNowTable")}</span>
      `; 
    }
  }
}

if (btnLootNow) btnLootNow.addEventListener("click", triggerLoot);
if (btnLootTable) btnLootTable.addEventListener("click", triggerLoot);

// Copy random XML to clipboard
btnCopyXml.addEventListener("click", async () => {
  try {
    btnCopyXml.textContent = "...";
    const res = await fetch("/api/download?format=json&ts=" + Date.now());
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || t("noValidKey"));
    }
    const data = await res.json();
    if (!data.xml) throw new Error("Keybox XML empty");

    await navigator.clipboard.writeText(data.xml);
    showToast(t("copiedXmlToast"), "success");
    btnCopyXml.textContent = currentLang === "vi" ? "Đã sao chép!" : "Copied!";
    setTimeout(() => {
      btnCopyXml.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>${t("copyXmlBtn")}</span>
      `;
    }, 2500);
  } catch (err) {
    showToast("Error: " + err.message, "error");
    btnCopyXml.textContent = t("copyXmlBtn");
  }
});

// Drop zone interactions
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files.length > 0) {
    handleFilesSelected(Array.from(e.dataTransfer.files));
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    handleFilesSelected(Array.from(fileInput.files));
  }
});

function handleFilesSelected(files) {
  selectedFiles = files;
  const label = currentLang === "vi" ? "Đã chọn:" : "Selected:";
  if (files.length === 1) {
    fileNameDisplay.textContent = `${label} ${files[0].name} (${(files[0].size / 1024).toFixed(1)} KB)`;
  } else {
    fileNameDisplay.textContent = `${label} ${files.length} files (${files.map(f => f.name).slice(0, 3).join(", ")}${files.length > 3 ? "..." : ""})`;
  }
}

// Upload Submission
btnSubmitUpload.addEventListener("click", async () => {
  let bodyData = null;
  let headers = {};

  if (activeTab === "file") {
    if (!selectedFiles || selectedFiles.length === 0) {
      uploadStatus.innerHTML = `<span class="text-danger">${t("selectFilePrompt")}</span>`;
      showToast(t("selectFilePrompt"), "error");
      return;
    }
    const formData = new FormData();
    for (const f of selectedFiles) {
      formData.append("files", f);
    }
    bodyData = formData;
  } else if (activeTab === "text") {
    const text = xmlTextInput.value.trim();
    if (!text) {
      uploadStatus.innerHTML = `<span class="text-danger">${t("enterXmlPrompt")}</span>`;
      showToast(t("enterXmlPrompt"), "error");
      return;
    }
    bodyData = JSON.stringify({ xml: text });
    headers["Content-Type"] = "application/json";
  } else if (activeTab === "url") {
    const url = keyboxUrlInput.value.trim();
    if (!url) {
      uploadStatus.innerHTML = `<span class="text-danger">${t("enterUrlPrompt")}</span>`;
      showToast(t("enterUrlPrompt"), "error");
      return;
    }
    bodyData = JSON.stringify({ url });
    headers["Content-Type"] = "application/json";
  }

  btnSubmitUpload.disabled = true;
  btnSubmitUpload.textContent = t("checkingGoogle");
  uploadStatus.innerHTML = `<span class="text-muted">${t("checkingGoogle")}</span>`;

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers,
      body: bodyData
    });

    const result = await res.json();
    displayAnalysisResult(result);

    if (result.success) {
      showToast(result.message || t("uploadSuccess"), "success", 4500);
      uploadStatus.innerHTML = `<span class="text-success">${result.message || t("uploadSuccess")}</span>`;
      selectedFiles = [];
      fileInput.value = "";
      fileNameDisplay.textContent = "";
      xmlTextInput.value = "";
      if (keyboxUrlInput) keyboxUrlInput.value = "";
      await loadStatus();
      await loadKeys();
    } else {
      showToast(result.error || result.message || t("uploadFailed"), "error");
      uploadStatus.innerHTML = `<span class="text-danger">${result.error || result.message || t("uploadFailed")}</span>`;
    }
  } catch (err) {
    showToast(t("connError") + ": " + err.message, "error");
    uploadStatus.innerHTML = `<span class="text-danger">${err.message}</span>`;
  } finally {
    btnSubmitUpload.disabled = false;
    btnSubmitUpload.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14M5 12h14"></path>
      </svg>
      <span>${t("btnUploadSubmit")}</span>
    `;
  }
});

function displayAnalysisResult(data) {
  analysisResultPanel.classList.remove("hidden");

  // Batch upload results
  if (data.results && data.results.length > 1) {
    let html = `
      <div style="margin-bottom:16px;">
        <h4 style="font-size:1.05rem; font-weight:700;">
          ${currentLang === "vi" ? `Kết quả xử lý hàng loạt (${data.valid_count}/${data.total_processed} hợp lệ)` : `Batch Processing Results (${data.valid_count}/${data.total_processed} valid)`}
        </h4>
        <p class="text-muted" style="font-size:0.88rem; margin-top:4px;">${data.message}</p>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>${currentLang === "vi" ? "File / Link" : "File / Link"}</th>
              <th>${t("thDevice")}</th>
              <th>${t("thAlg")}</th>
              <th>${t("thStatus")}</th>
              <th>${currentLang === "vi" ? "Chi tiết" : "Details"}</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const item of data.results) {
      const isStrong = item.status === "strong";
      const isDevice = item.status === "device";
      const isSkipped = item.skipped;
      const badgeClass = isSkipped ? "badge-device" : (isStrong ? "badge-strong" : (isDevice ? "badge-device" : "badge-banned"));
      const statusText = isSkipped ? (currentLang === "vi" ? "BỎ QUA (TRÙNG)" : "SKIPPED (DUP)") : (item.status || "ERROR");

      html += `
        <tr>
          <td><code>${item.filename}</code></td>
          <td>${item.deviceId || "N/A"}</td>
          <td>${item.algorithm || "N/A"}</td>
          <td><span class="badge-tag ${badgeClass}">${statusText}</span></td>
          <td><small>${item.message || item.error || "OK"}</small></td>
        </tr>
      `;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    analysisResultBody.innerHTML = html;
    analysisResultPanel.scrollIntoView({ behavior: "smooth" });
    return;
  }

  // Single file result
  const item = data.results ? data.results[0] : data;
  if (!item || (!item.analysis && !item.error)) {
    analysisResultBody.innerHTML = `<p class="text-danger">${data.error || "No analysis available."}</p>`;
    return;
  }

  const isSkipped = item.skipped;
  const overall = item.analysis?.overall || (item.success ? "pass" : "fail");
  const overallBadge = isSkipped ? `<span class="badge-tag badge-device">${currentLang === "vi" ? "BỎ QUA (TRÙNG LẶP)" : "SKIPPED (DUPLICATE)"}</span>`
                     : (overall === "pass" ? `<span class="badge-tag badge-strong">${currentLang === "vi" ? "HỢP LỆ (PASS)" : "VALID (PASS)"}</span>` 
                     : (overall === "warn" ? `<span class="badge-tag badge-device">${currentLang === "vi" ? "CẢNH BÁO (WARN)" : "WARNING (WARN)"}</span>` 
                     : `<span class="badge-tag badge-banned">${currentLang === "vi" ? "THU HỒI / LỖI (FAIL)" : "REVOKED / ERROR (FAIL)"}</span>`));

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
      <div>
        <strong>${currentLang === "vi" ? "Đánh giá tổng quan:" : "Overall Evaluation:"}</strong> ${overallBadge}
        <span style="margin-left: 14px;"><strong>${currentLang === "vi" ? "Trạng thái:" : "Status:"}</strong> <span class="badge-tag badge-${item.status || 'banned'}">${item.status || 'banned'}</span></span>
      </div>
      <div><strong>Device ID:</strong> <code>${item.deviceId || "N/A"}</code></div>
    </div>
  `;

  if (item.message) {
    html += `<div class="result-item text-primary"><strong>${currentLang === "vi" ? "Thông báo:" : "Message:"}</strong> ${item.message}</div>`;
  }

  if (item.error) {
    html += `<div class="result-item text-danger"><strong>${currentLang === "vi" ? "Lỗi:" : "Error:"}</strong> ${item.error}</div>`;
  }

  if (item.analysis?.errors?.length) {
    html += `
      <div class="result-item text-danger">
        <strong>${currentLang === "vi" ? "Lỗi kiểm tra:" : "Verification Errors:"}</strong>
        <ul>${item.analysis.errors.map(e => `<li>${e}</li>`).join("")}</ul>
      </div>
    `;
  }

  if (item.analysis?.warnings?.length) {
    html += `
      <div class="result-item text-warning">
        <strong>${currentLang === "vi" ? "Cảnh báo:" : "Warnings:"}</strong>
        <ul>${item.analysis.warnings.map(w => `<li>${w}</li>`).join("")}</ul>
      </div>
    `;
  }

  analysisResultBody.innerHTML = html;
  analysisResultPanel.scrollIntoView({ behavior: "smooth" });
}

btnCloseResult.addEventListener("click", () => {
  analysisResultPanel.classList.add("hidden");
});

// Check Now Trigger
btnCheckNow.addEventListener("click", async () => {
  btnCheckNow.disabled = true;
  btnCheckNow.textContent = t("statusChecking");
  try {
    const res = await fetch("/api/check-now", { method: "POST" });
    const data = await res.json();
    const msg = currentLang === "vi"
      ? `Đã kiểm tra lại toàn bộ với Google! ${data.checkResult.updatedCount} key đánh giá, ${data.lootResult.looted_count} key Strong mới được loot.`
      : `Full recheck completed with Google! ${data.checkResult.updatedCount} keys evaluated, ${data.lootResult.looted_count} new Strong keys looted.`;
    showToast(msg, "success", 5000);
    await loadStatus();
    await loadKeys();
    await loadSources();
  } catch (err) {
    showToast(t("connError") + ": " + err.message, "error");
  } finally {
    btnCheckNow.disabled = false;
    btnCheckNow.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
      </svg>
      <span>${t("btnCheckAll")}</span>
    `;
  }
});

// Refresh button
btnRefresh.addEventListener("click", async () => {
  const icon = btnRefresh.querySelector(".refresh-icon");
  if (icon) icon.classList.add("spin-icon");
  try {
    await Promise.all([loadStatus(), loadKeys(), loadSources()]);
    showToast(currentLang === "vi" ? "Đã làm mới dữ liệu thời gian thực!" : "Realtime data refreshed!", "info", 2000);
  } finally {
    setTimeout(() => {
      if (icon) icon.classList.remove("spin-icon");
    }, 600);
  }
});

// ==========================================
// KEYBOX REPAIR & NORMALIZATION ENGINE UI
// ==========================================
let repairSelectedFile = null;
let repairActiveTab = "upload";
let lastRepairedXml = "";

const repairTabUpload = document.getElementById("repair-tab-upload");
const repairTabPaste = document.getElementById("repair-tab-paste");
const repairContentUpload = document.getElementById("repair-content-upload");
const repairContentPaste = document.getElementById("repair-content-paste");
const repairDropZone = document.getElementById("repair-drop-zone");
const repairFileInput = document.getElementById("repair-file-input");
const repairFileNameDisplay = document.getElementById("repair-file-name-display");
const repairTextInput = document.getElementById("repair-text-input");
const btnSubmitRepair = document.getElementById("btn-submit-repair");
const repairStatus = document.getElementById("repair-status");
const repairOutputPanel = document.getElementById("repair-output-panel");
const repairFixesCount = document.getElementById("repair-fixes-count");
const repairDeviceId = document.getElementById("repair-device-id");
const repairFixesList = document.getElementById("repair-fixes-list");
const repairXmlCode = document.getElementById("repair-xml-code");
const btnCopyRepairedXml = document.getElementById("btn-copy-repaired-xml");
const btnDownloadRepairedXml = document.getElementById("btn-download-repaired-xml");

// Tab switching for Repair
if (repairTabUpload && repairTabPaste) {
  repairTabUpload.addEventListener("click", () => {
    repairActiveTab = "upload";
    repairTabUpload.classList.add("active");
    repairTabUpload.setAttribute("aria-selected", "true");
    repairTabPaste.classList.remove("active");
    repairTabPaste.setAttribute("aria-selected", "false");
    repairContentUpload?.classList.remove("hidden");
    repairContentPaste?.classList.add("hidden");
  });

  repairTabPaste.addEventListener("click", () => {
    repairActiveTab = "paste";
    repairTabPaste.classList.add("active");
    repairTabPaste.setAttribute("aria-selected", "true");
    repairTabUpload.classList.remove("active");
    repairTabUpload.setAttribute("aria-selected", "false");
    repairContentPaste?.classList.remove("hidden");
    repairContentUpload?.classList.add("hidden");
  });
}

// File drop zone for repair
if (repairDropZone && repairFileInput) {
  repairDropZone.addEventListener("click", () => repairFileInput.click());

  repairDropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    repairDropZone.classList.add("drag-over");
  });

  repairDropZone.addEventListener("dragleave", () => {
    repairDropZone.classList.remove("drag-over");
  });

  repairDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    repairDropZone.classList.remove("drag-over");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      repairSelectedFile = e.dataTransfer.files[0];
      if (repairFileNameDisplay) {
        repairFileNameDisplay.textContent = `✓ ${repairSelectedFile.name} (${(repairSelectedFile.size / 1024).toFixed(1)} KB)`;
      }
    }
  });

  repairFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      repairSelectedFile = e.target.files[0];
      if (repairFileNameDisplay) {
        repairFileNameDisplay.textContent = `✓ ${repairSelectedFile.name} (${(repairSelectedFile.size / 1024).toFixed(1)} KB)`;
      }
    }
  });
}

// Submit Repair
if (btnSubmitRepair) {
  btnSubmitRepair.addEventListener("click", async () => {
    let bodyData = null;
    let headers = {};

    if (repairActiveTab === "upload") {
      if (!repairSelectedFile) {
        repairStatus.innerHTML = `<span class="text-danger">${t("repairNoContentPrompt")}</span>`;
        showToast(t("repairNoContentPrompt"), "error");
        return;
      }
      const formData = new FormData();
      formData.append("file", repairSelectedFile);
      bodyData = formData;
    } else {
      const text = repairTextInput ? repairTextInput.value.trim() : "";
      if (!text) {
        repairStatus.innerHTML = `<span class="text-danger">${t("repairNoContentPrompt")}</span>`;
        showToast(t("repairNoContentPrompt"), "error");
        return;
      }
      bodyData = JSON.stringify({ xml: text });
      headers["Content-Type"] = "application/json";
    }

    btnSubmitRepair.disabled = true;
    btnSubmitRepair.textContent = t("repairingStatus");
    repairStatus.innerHTML = `<span class="text-muted">${t("repairingStatus")}</span>`;

    try {
      const res = await fetch("/api/repair", {
        method: "POST",
        headers,
        body: bodyData
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Repair failed");
      }

      lastRepairedXml = data.repairedXml;
      repairStatus.innerHTML = `<span class="text-success">${t("repairSuccessToast")}</span>`;
      showToast(t("repairSuccessToast"), "success");

      // Update fixes list
      if (repairFixesCount) {
        repairFixesCount.textContent = currentLang === "vi" 
          ? `${data.fixesApplied?.length || 0} mục đã xử lý`
          : `${data.fixesApplied?.length || 0} issues resolved`;
      }
      if (repairDeviceId) {
        repairDeviceId.textContent = `Device: ${data.deviceId || 'N/A'}`;
      }

      if (repairFixesList) {
        repairFixesList.innerHTML = (data.fixesApplied || []).map(f => `<li>${f}</li>`).join("");
      }

      if (repairXmlCode) {
        repairXmlCode.textContent = data.repairedXml;
      }

      if (repairOutputPanel) {
        repairOutputPanel.classList.remove("hidden");
        repairOutputPanel.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err) {
      repairStatus.innerHTML = `<span class="text-danger">${err.message}</span>`;
      showToast(`${t("connError")}: ${err.message}`, "error");
    } finally {
      btnSubmitRepair.disabled = false;
      btnSubmitRepair.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
        </svg>
        <span>${t("btnRepairSubmit")}</span>
      `;
    }
  });
}

// Copy Repaired XML
if (btnCopyRepairedXml) {
  btnCopyRepairedXml.addEventListener("click", async () => {
    if (!lastRepairedXml) return;
    try {
      await navigator.clipboard.writeText(lastRepairedXml);
      showToast(t("copiedXmlToast"), "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

// Download Repaired XML
if (btnDownloadRepairedXml) {
  btnDownloadRepairedXml.addEventListener("click", () => {
    if (!lastRepairedXml) return;
    const blob = new Blob([lastRepairedXml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keybox.xml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(currentLang === "vi" ? "Đã tải xuống keybox.xml chuẩn hóa!" : "Downloaded standardized keybox.xml!", "success");
  });
}

const notificationForm = document.getElementById("notification-settings-form");
const notificationAccessInput = document.getElementById("notification-access-token");
const notificationStatus = document.getElementById("notification-status");
let notificationAccessToken = "";

function fillNotificationSettings(config) {
  document.getElementById("notification-webhook-enabled").checked = config.webhook_enabled;
  document.getElementById("notification-webhook-url").value = config.webhook_url;
  document.getElementById("notification-telegram-enabled").checked = config.telegram_enabled;
  document.getElementById("notification-chat-id").value = config.telegram_chat_id;
  for (const [id, saved] of [["notification-webhook-token", config.webhook_token_set], ["notification-bot-token", config.telegram_bot_token_set]]) {
    const input = document.getElementById(id);
    input.value = "";
    input.placeholder = saved ? t("notificationsSecretSaved") : "";
    if (saved) input.dataset.i18nPlaceholder = "notificationsSecretSaved";
    else delete input.dataset.i18nPlaceholder;
  }
}

async function notificationRequest(method, path = "", body) {
  const buttons = document.querySelectorAll("#notification-unlock-form button, #notification-settings-form button");
  buttons.forEach(button => { button.disabled = true; });
  notificationStatus.textContent = t("notificationsWorking");
  try {
    const response = await fetch(`/api/notifications${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${notificationAccessToken}` },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json();
    if (response.status === 401) {
      notificationAccessToken = "";
      notificationForm.classList.add("hidden");
      throw new Error(t("notificationsUnauthorized"));
    }
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

document.getElementById("notification-unlock-form").addEventListener("submit", async event => {
  event.preventDefault();
  notificationAccessToken = notificationAccessInput.value.trim();
  notificationAccessInput.value = "";
  try {
    fillNotificationSettings(await notificationRequest("GET"));
    notificationForm.classList.remove("hidden");
    notificationStatus.textContent = t("notificationsLoaded");
  } catch (err) {
    notificationStatus.textContent = err.message;
  }
});

function readNotificationSettings() {
  return {
    webhook_enabled: document.getElementById("notification-webhook-enabled").checked,
    webhook_url: document.getElementById("notification-webhook-url").value,
    webhook_token: document.getElementById("notification-webhook-token").value,
    telegram_enabled: document.getElementById("notification-telegram-enabled").checked,
    telegram_bot_token: document.getElementById("notification-bot-token").value,
    telegram_chat_id: document.getElementById("notification-chat-id").value
  };
}

notificationForm.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const config = await notificationRequest("PUT", "", readNotificationSettings());
    fillNotificationSettings(config);
    notificationStatus.textContent = t("notificationsSaved");
  } catch (err) {
    notificationStatus.textContent = err.message;
  }
});

document.getElementById("notification-test").addEventListener("click", async () => {
  try {
    if (!notificationForm.reportValidity()) return;
    const data = await notificationRequest("POST", "/test", readNotificationSettings());
    notificationStatus.textContent = data.results.length ? data.results.map(result =>
      `${result.channel}: ${t(result.success ? "notificationsTestSuccess" : "notificationsTestFailed")}${result.error ? ` (${result.error})` : ""}`
    ).join(" · ") : t("notificationsNoChannels");
  } catch (err) {
    notificationStatus.textContent = err.message;
  }
});

let notificationAdminSession = "";
let notificationSubscribers = [];
let notificationIssuedId = "";
const notificationAdminPanel = document.getElementById("notification-admin-panel");
const notificationAdminStatus = document.getElementById("notification-admin-status");

function clearNotificationAdmin() {
  notificationAdminSession = "";
  notificationSubscribers = [];
  notificationIssuedId = "";
  document.getElementById("notification-issued-token").value = "";
  document.getElementById("notification-issued").classList.add("hidden");
  notificationAdminPanel.classList.add("hidden");
  document.getElementById("notification-admin-login").classList.remove("hidden");
}

async function notificationAdminRequest(method, path, body) {
  const response = await fetch(`/api/notifications/admin${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${notificationAdminSession}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (response.status === 401) {
    clearNotificationAdmin();
    throw new Error(t("notificationsAdminUnauthorized"));
  }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function renderNotificationSubscribers() {
  const list = document.getElementById("notification-subscriber-list");
  list.replaceChildren();
  if (!notificationSubscribers.length) {
    const item = document.createElement("li");
    item.textContent = t("notificationsNoTokens");
    list.appendChild(item);
  }
  for (const subscriber of notificationSubscribers) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = subscriber.name;
    const revoke = document.createElement("button");
    revoke.type = "button";
    revoke.className = "btn btn-danger-outline btn-sm";
    revoke.textContent = t("notificationsRevoke");
    revoke.addEventListener("click", async () => {
      if (!window.confirm(t("notificationsRevokeConfirm"))) return;
      revoke.disabled = true;
      try {
        await notificationAdminRequest("DELETE", `/subscriptions/${subscriber.id}`);
        if (notificationIssuedId === subscriber.id) {
          document.getElementById("notification-issued-token").value = "";
          document.getElementById("notification-issued").classList.add("hidden");
        }
        await loadNotificationSubscribers();
      } catch (err) {
        notificationAdminStatus.textContent = err.message;
      } finally {
        revoke.disabled = false;
      }
    });
    item.append(name, revoke);
    list.appendChild(item);
  }
}

async function loadNotificationSubscribers() {
  const data = await notificationAdminRequest("GET", "/subscriptions");
  notificationSubscribers = data.subscriptions;
  renderNotificationSubscribers();
}

document.getElementById("notification-admin-login").addEventListener("submit", async event => {
  event.preventDefault();
  const passwordInput = document.getElementById("notification-admin-password");
  const password = passwordInput.value;
  passwordInput.value = "";
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  notificationAdminStatus.textContent = t("notificationsWorking");
  try {
    const data = await notificationAdminRequest("POST", "/login", { password });
    notificationAdminSession = data.token;
    await loadNotificationSubscribers();
    notificationAdminPanel.classList.remove("hidden");
    document.getElementById("notification-admin-login").classList.add("hidden");
    notificationAdminStatus.textContent = "";
  } catch (err) {
    notificationAdminStatus.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("notification-issue-form").addEventListener("submit", async event => {
  event.preventDefault();
  const nameInput = document.getElementById("notification-subscriber-name");
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    const data = await notificationAdminRequest("POST", "/subscriptions", { name: nameInput.value });
    notificationIssuedId = data.id;
    document.getElementById("notification-issued-token").value = data.token;
    document.getElementById("notification-issued").classList.remove("hidden");
    nameInput.value = "";
    notificationAdminStatus.textContent = "";
    await loadNotificationSubscribers();
  } catch (err) {
    notificationAdminStatus.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("notification-copy-token").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.getElementById("notification-issued-token").value);
    notificationAdminStatus.textContent = t("notificationsCopied");
  } catch (err) {
    notificationAdminStatus.textContent = err.message;
  }
});

document.getElementById("notification-admin-logout").addEventListener("click", async () => {
  try {
    await notificationAdminRequest("POST", "/logout");
    notificationAdminStatus.textContent = "";
  } catch (err) {
    notificationAdminStatus.textContent = err.message;
  } finally {
    clearNotificationAdmin();
  }
});

// Initial load & Setup Language
applyLanguage(currentLang);
loadKeys();
const navLinks = document.querySelectorAll('.nav-links a');
function updateNavigation() {
  let active = '#overview';
  navLinks.forEach(link => {
    const section = document.querySelector(link.getAttribute('href'));
    if (section && section.getBoundingClientRect().top <= 160) active = link.getAttribute('href');
  });
  navLinks.forEach(link => {
    const selected = link.getAttribute('href') === active;
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}
window.addEventListener('scroll', updateNavigation, { passive: true });
updateNavigation();
setInterval(() => {
  loadStatus();
  loadKeys();
  loadSources();
}, 30000);
