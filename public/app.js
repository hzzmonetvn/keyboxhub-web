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
    statBannedHint: "Tự động xóa ngay khi bị thu hồi",
    statDeviceHint: "Dự phòng khi hết Strong",
    statStrongHint: "Ưu tiên cấp phát",
    scrollTable: "Bảng dữ liệu, cuộn ngang để xem thêm",
    chooseFiles: "Chọn file XML hoặc ZIP",
    skipContent: "Đến nội dung chính",
    viewDocs: "Tài liệu API",
    navSources: "Nguồn",
    navLogs: "Log",
    logsTitle: "Log gần đây",
    logsDesc: "10 sự kiện mới nhất trên toàn hệ thống.",
    thLogDate: "Ngày",
    loadingLogs: "Đang tải log...",
    noLogs: "Chưa có sự kiện nào.",
    navRepository: "Kho keybox",
    adminNav: "Quản trị",
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
    tableSubtitle: "Tìm và tải keybox theo trạng thái. Key bị thu hồi sẽ tự động xóa ngay lập tức.",
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
    sourceAdded: "Đã gửi nguồn cộng đồng. Nguồn sẽ được quét theo lịch.",
    sourceAddFailed: "Không thể thêm nguồn.",
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
    apiDescStatus: "Kiểm tra trạng thái hệ thống và danh sách metadata keybox khả dụng (tên, link tải, RKP, chứng chỉ)",
    apiDescReport: "Báo cáo key bị hạ cấp xuống Device (Cần access token, 1 báo cáo chuyển ngay sang device)",
    footerText: "Powered by KeyBoxChecker · Kiểm tra CRL & quét nguồn mỗi giờ · Tự động xóa ngay khi bị thu hồi",
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
    copiedXmlToast: "Đã sao chép XML của keybox vào clipboard",
    copiedIdToast: "Đã sao chép: ",
    connError: "Lỗi kết nối tới máy chủ",
    reportConfirm: "Bạn có chắc chắn muốn báo cáo Keybox #",
    reportConfirmSuffix: " đã bị hạ cấp xuống Device Integrity? (Khi đủ trên 5 báo cáo, keybox sẽ tự động chuyển trạng thái)",
    reportSuccess: "Báo cáo thành công",
    lootFinishedToast: "Hoàn tất quét nguồn bên thứ ba",
    lootAddedText: "Thêm mới:",
    lootSkippedText: "Bỏ qua:",
    recheckedGoogleToast: "Đã kiểm tra lại toàn bộ với Google",
    statusStrongDesc: "Keybox Strong Integrity đang sẵn sàng. Yêu cầu tải xuống sẽ được ưu tiên cấp key Strong.",
    statusDeviceDesc: "Hiện không có key Strong. Bạn vẫn có thể tải keybox Device Integrity.",
    statusBannedDesc: "Chưa có keybox khả dụng. Đóng góp keybox hoặc quét nguồn cộng đồng để cập nhật.",
    selectFilePrompt: "Vui lòng chọn file XML hoặc ZIP trước",
    enterXmlPrompt: "Vui lòng nhập nội dung XML",
    enterUrlPrompt: "Vui lòng nhập URL của keybox",
    checkingGoogle: "Đang kiểm tra với Google...",
    uploadSuccess: "Tải lên thành công",
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
    repairSuccessToast: "Keybox đã được sửa lỗi & chuẩn hóa thành công",
    repairNoContentPrompt: "Vui lòng chọn file hoặc dán nội dung keybox cần sửa lỗi",
    themeAuto: "Tự động",
    themeLight: "Sáng",
    themeDark: "Tối",
    themeAutoToast: "Chế độ giao diện: Tự động (theo hệ thống)",
    themeLightToast: "Chế độ giao diện: Sáng",
    themeDarkToast: "Chế độ giao diện: Tối",
    themeToggleTitleAuto: "Chế độ: Tự động (nhấn để đổi)",
    themeToggleTitleLight: "Chế độ: Sáng (nhấn để đổi)",
    themeToggleTitleDark: "Chế độ: Tối (nhấn để đổi)",
    adblockTitle: "Hỗ trợ duy trì máy chủ",
    adblockDesc: "Trang web duy trì máy chủ và kiểm tra chứng chỉ hoàn toàn miễn phí nhờ quảng cáo. Vui lòng tắt trình chặn quảng cáo để ủng hộ dự án.",
    adblockTurnedOff: "Đã tắt trình chặn",
    adblockSkip: "Bỏ qua lần này"
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
    statBannedHint: "Automatically purged immediately",
    statDeviceHint: "Fallback when Strong runs out",
    statStrongHint: "First in download priority",
    scrollTable: "Data table, scroll horizontally for more",
    chooseFiles: "Choose XML or ZIP files",
    skipContent: "Skip to main content",
    viewDocs: "API documentation",
    navSources: "Sources",
    navLogs: "Logs",
    logsTitle: "Recent logs",
    logsDesc: "The 10 most recent events across the system.",
    thLogDate: "Date",
    loadingLogs: "Loading logs...",
    noLogs: "No events yet.",
    navRepository: "Repository",
    adminNav: "Admin",
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
    tableSubtitle: "Find and download keys by status. Revoked keys are purged immediately.",
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
    sourceAdded: "Community source submitted. It will be scanned on schedule.",
    sourceAddFailed: "Could not add source.",
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
    apiDescStatus: "Check system status and available keyboxes metadata (name, download URL, RKP, certs)",
    apiDescReport: "Report key downgraded to Device (Requires access token, 1 report transitions immediately)",
    footerText: "Powered by KeyBoxChecker · Hourly CRL checks & source scans · Revoked keys purged immediately",
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
    copiedXmlToast: "Keybox XML copied to clipboard",
    copiedIdToast: "Copied: ",
    connError: "Server connection error",
    reportConfirm: "Are you sure you want to report Keybox #",
    reportConfirmSuffix: " as degraded to Device Integrity? (Promotes to Device upon >5 reports)",
    reportSuccess: "Report submitted successfully",
    lootFinishedToast: "Community source scan completed",
    lootAddedText: "Looted:",
    lootSkippedText: "Duplicates Skipped:",
    recheckedGoogleToast: "Full database rechecked with Google",
    statusStrongDesc: "Strong Integrity keyboxes are ready. Downloads will prioritize available Strong keys.",
    statusDeviceDesc: "No Strong keys are available right now. You can still download a Device Integrity keybox.",
    statusBannedDesc: "No keyboxes are available. Contribute a keybox or scan community sources to get started.",
    selectFilePrompt: "Please select an XML or ZIP file first",
    enterXmlPrompt: "Please enter XML content",
    enterUrlPrompt: "Please enter keybox URL",
    checkingGoogle: "Verifying with Google...",
    uploadSuccess: "Uploaded successfully",
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
    repairSuccessToast: "Keybox repaired and standardized successfully",
    repairNoContentPrompt: "Please choose a file or paste keybox content to repair",
    themeAuto: "Auto",
    themeLight: "Light",
    themeDark: "Dark",
    themeAutoToast: "Theme: Auto (system)",
    themeLightToast: "Theme: Light",
    themeDarkToast: "Theme: Dark",
    themeToggleTitleAuto: "Theme: Auto (click to toggle)",
    themeToggleTitleLight: "Theme: Light (click to toggle)",
    themeToggleTitleDark: "Theme: Dark (click to toggle)",
    adblockTitle: "Support server hosting",
    adblockDesc: "Keybox Hub provides free certificate verification and distribution. Please consider disabling your ad blocker to help cover server expenses.",
    adblockTurnedOff: "AdBlock disabled",
    adblockSkip: "Skip for now"
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
  [['btn-refresh', 'navBtnRefresh']].forEach(([id, key]) => {
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
  updateThemeToggleUI();
  loadStatus();
  renderKeysTable();
  loadSources();
  loadLogs();
}

function escapeHTML(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    <div class="toast-msg" style="flex:1; line-height:1.4;"></div>
    <button class="toast-close" style="background:transparent; border:none; color:var(--text-dim); cursor:pointer; font-size:1.1rem; line-height:1; padding:2px;">&times;</button>
  `;
  toast.querySelector(".toast-msg").textContent = message;
  toast.querySelector(".toast-close").addEventListener("click", () => toast.remove());

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
const btnCopyXml = document.getElementById("btn-copy-xml");

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const fileNameDisplay = document.getElementById("file-name-display");
const xmlTextInput = document.getElementById("xml-text-input");
const keyboxUrlInput = document.getElementById("keybox-url-input");
const btnSubmitUpload = document.getElementById("btn-submit-upload");
const uploadStatus = document.getElementById("upload-status");


const analysisResultPanel = document.getElementById("analysis-result-panel");
const analysisResultBody = document.getElementById("analysis-result-body");
const btnCloseResult = document.getElementById("btn-close-result");

// Theme switcher toggle
const btnThemeToggle = document.getElementById("btn-theme-toggle");

function updateThemeToggleUI(mode) {
  const btn = document.getElementById("btn-theme-toggle");
  const label = document.getElementById("theme-label");
  const icon = document.getElementById("theme-icon");
  if (!btn || !label || !icon) return;

  const activeMode = mode || (window.KeyboxTheme ? window.KeyboxTheme.getMode() : localStorage.getItem("keybox_theme") || "auto");

  if (activeMode === "light") {
    label.textContent = t("themeLight");
    btn.title = t("themeToggleTitleLight");
    btn.setAttribute("aria-label", t("themeToggleTitleLight"));
    icon.innerHTML = '<circle cx="12" cy="12" r="4"></circle><line x1="12" y1="2" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"></line><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"></line><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"></line>';
  } else if (activeMode === "dark") {
    label.textContent = t("themeDark");
    btn.title = t("themeToggleTitleDark");
    btn.setAttribute("aria-label", t("themeToggleTitleDark"));
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
  } else {
    label.textContent = t("themeAuto");
    btn.title = t("themeToggleTitleAuto");
    btn.setAttribute("aria-label", t("themeToggleTitleAuto"));
    icon.innerHTML = '<rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>';
  }
}

if (btnThemeToggle) {
  btnThemeToggle.addEventListener("click", () => {
    const nextMode = window.KeyboxTheme ? window.KeyboxTheme.cycle() : 'auto';
    updateThemeToggleUI(nextMode);
    const toastKey = nextMode === "light" ? "themeLightToast" : nextMode === "dark" ? "themeDarkToast" : "themeAutoToast";
    showToast(t(toastKey), "info", 2000);
  });
}

window.addEventListener("keybox-theme-change", (e) => {
  updateThemeToggleUI(e.detail?.mode);
});
updateThemeToggleUI();

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

// Fetch and render System Status
async function loadStatus() {
  try {
    const res = await fetch("/api/status?ts=" + Date.now(), {
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    systemStatusBadge.className = `status-badge status-${data.status}`;
    systemStatusText.textContent = (data.status === "strong" || data.status === "device") ? data.status.toUpperCase() : t("noValidKey");

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

    const btnRkp = document.getElementById("btn-download-rkp");
    if (btnRkp) {
      if ((data.total_rkp_valid || 0) > 0) {
        btnRkp.classList.remove("disabled");
        btnRkp.style.pointerEvents = "auto";
        btnRkp.style.opacity = "1";
        btnRkp.href = "/api/download?profile=rkp";
      } else {
        btnRkp.classList.add("disabled");
        btnRkp.style.pointerEvents = "none";
        btnRkp.style.opacity = "0.5";
        btnRkp.removeAttribute("href");
      }
    }

    const btnHw = document.getElementById("btn-download-hw");
    if (btnHw) {
      if ((data.total_hw_valid || 0) > 0) {
        btnHw.classList.remove("disabled");
        btnHw.style.pointerEvents = "auto";
        btnHw.style.opacity = "1";
        btnHw.href = "/api/download?profile=hw";
      } else {
        btnHw.classList.add("disabled");
        btnHw.style.pointerEvents = "none";
        btnHw.style.opacity = "0.5";
        btnHw.removeAttribute("href");
      }
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
        <td colspan="9" class="text-center py-4" style="color:var(--text-dim);">${emptyMsg}</td>
      </tr>
    `;
    return;
  }

  keysTableBody.innerHTML = filtered.map(k => {
    const isStrong = k.status === "strong";
    const isDevice = k.status === "device";
    const badgeClass = isStrong ? "badge-strong" : (isDevice ? "badge-device" : "badge-banned");

    let statusBadge = `<span class="badge-tag ${badgeClass}">${escapeHTML(k.status)}</span>`;
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

    let sourceBadge = `<span class="badge-tag badge-device">${escapeHTML(k.source || "User")}</span>`;
    if (k.source?.includes("Specter")) {
      sourceBadge = `<span class="badge-tag badge-strong" title="${escapeHTML(k.source)}">${escapeHTML(k.source)}</span>`;
    } else if (k.source?.startsWith("http")) {
      sourceBadge = `<span class="badge-tag badge-device" title="${escapeHTML(k.source)}">URL Link</span>`;
    }

    const fullSerial = k.primary_serial || (k.serials && k.serials[0]) || "";
    const shortSerial = fullSerial.length > 16 
      ? `${fullSerial.slice(0, 8)}…${fullSerial.slice(-6)}` 
      : (fullSerial || "—");

    const serialCell = fullSerial ? `
      <td>
        <div style="display:flex; align-items:center; gap:6px;">
          <code style="font-size:11px;" title="${escapeHTML(fullSerial)}">${escapeHTML(shortSerial)}</code>
          <button class="btn btn-secondary btn-micro" title="Copy Serial" data-copy="${escapeHTML(fullSerial)}">
            ${t("btnCopy")}
          </button>
        </div>
      </td>
    ` : `<td><span style="color:var(--text-dim);">—</span></td>`;

    return `
      <tr>
        <td><strong>#${Number(k.id)}</strong></td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <span title="${escapeHTML(k.device_id)}"><strong>${escapeHTML(k.device_id || "N/A")}</strong></span>
            <button class="btn btn-secondary btn-micro" title="Copy Device ID" data-copy="${escapeHTML(k.device_id)}">
              ${t("btnCopy")}
            </button>
          </div>
        </td>
        ${serialCell}
        <td>
          <code>${escapeHTML(k.algorithm || "rsa")}</code>
          ${k.is_rkp ? '<span class="badge-tag badge-rkp" style="margin-left:4px;" title="Remote Key Provisioning (RKP: EC Key & Google EC Root CA)">RKP</span>' : ''}
        </td>
        <td>${statusBadge}</td>
        <td><small>${sourceBadge}</small></td>
        <td>
          <span>${k.report_count}</span>
          ${k.report_count >= 1 ? '<small class="text-warning"> (Device)</small>' : ''}
        </td>
        <td><small>${formatTime(k.uploaded_at)}</small></td>
        <td>
          <div class="table-actions">
            <a href="/api/download?id=${Number(k.id)}" class="btn btn-secondary btn-sm" download="keybox_${Number(k.id)}.xml" title="Download XML">
              ${t("btnDownloadRow")}
            </a>
            <button class="btn btn-secondary btn-sm" data-copy-xml="${Number(k.id)}" title="Copy XML to Clipboard">
              XML
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

keysTableBody.addEventListener("click", e => {
  const b = e.target.closest("[data-copy-xml]");
  if (b && b.dataset.copyXml) {
    copyKeyXml(Number(b.dataset.copyXml));
  }
});

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
        <td colspan="9" class="text-center py-4 text-danger">${t("connError")}: ${escapeHTML(err.message)}</td>
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

// Submit a community source without starting an immediate scan.
const sourceForm = document.getElementById("source-form");
if (sourceForm) {
  sourceForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = document.getElementById("source-submit");
    const name = document.getElementById("source-name").value.trim();
    const url = document.getElementById("source-url").value.trim();
    const type = document.getElementById("source-type").value;
    submit.disabled = true;
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, type })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("sourceAddFailed"));
      sourceForm.reset();
      showToast(t("sourceAdded"), "success");
      await loadSources();
    } catch (err) {
      showToast(err.message || t("connError"), "error");
    } finally {
      submit.disabled = false;
    }
  });
}

// Fetch and render recent system-wide key events
async function loadLogs() {
  const tbody = document.getElementById("logs-table-body");
  if (!tbody) return;
  try {
    const res = await fetch("/api/logs?ts=" + Date.now(), {
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const logs = data.logs || [];
    tbody.innerHTML = logs.length ? logs.map(log => `
      <tr>
        <td><code>${escapeHTML(log.device_id)}</code></td>
        <td><code>${escapeHTML(log.serial || "—")}</code></td>
        <td><span class="badge-tag badge-${log.status === "banned" ? "banned" : log.status === "device" ? "device" : "strong"}">${escapeHTML(log.status)}</span></td>
        <td><small>${formatTime(log.created_at)}</small></td>
      </tr>
    `).join("") : `<tr><td colspan="4" class="text-center py-3" style="color:var(--text-dim);">${t("noLogs")}</td></tr>`;
  } catch (err) {
    console.error("Could not load logs:", err);
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-3 text-danger">${t("connError")}: ${escapeHTML(err.message)}</td></tr>`;
  }
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

    tbody.innerHTML = sources.map(s => {
      let safeUrl = "";
      try {
        const parsedUrl = new URL(s.url);
        if (parsedUrl.protocol === "https:" && !parsedUrl.username && !parsedUrl.password) safeUrl = parsedUrl.href;
      } catch {}
      const safeName = escapeHTML(s.name);
      const safeType = escapeHTML(s.type);
      const safeUrlText = escapeHTML(s.url);
      const safeStatus = escapeHTML(s.last_status || "---");
      return `
      <tr>
        <td><strong>${safeName}</strong></td>
        <td><code>${safeType}</code></td>
        <td><small>${safeUrl ? `<a href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener" style="color:var(--text-muted); word-break:break-all;">${safeUrlText}</a>` : safeUrlText}</small></td>
        <td><small class="${s.last_status?.includes('OK') ? 'text-success' : 'text-dim'}">${safeStatus}</small></td>
        <td><small>${formatTime(s.last_fetched_at)}</small></td>
      </tr>
    `;
    }).join("");
  } catch (err) {
    console.error("Could not load sources:", err);
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">${t("connError")}: ${err.message}</td></tr>`;
  }
}

// Copy plain text utility
window.copyText = function(text) {
  if (!text) return;
  navigator.clipboard.writeText(text)
    .then(() => {
      const displayTxt = text.length > 45 ? text.substring(0, 42) + "..." : text;
      showToast(`${t("copiedIdToast")}"${displayTxt}"`, "success");
    })
    .catch(() => showToast(currentLang === "vi" ? "Không thể sao chép văn bản" : "Failed to copy text", "error"));
};

// Global click delegation for [data-copy]
document.addEventListener("click", e => {
  const b = e.target.closest("[data-copy]");
  if (b && b.dataset.copy !== undefined) {
    copyText(b.dataset.copy);
  }
});

// Copy XML of a specific key
window.copyKeyXml = async function(id) {
  try {
    const res = await fetch(`/api/download?id=${id}&format=json`);
    if (!res.ok) throw new Error("Keybox not found");
    const data = await res.json();
    if (!data.xml) throw new Error("XML content empty");
    await navigator.clipboard.writeText(data.xml);
    showToast(currentLang === "vi" ? `Đã sao chép XML của keybox #${id}` : `Copied XML for keybox #${id}`, "success");
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
};

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

    const added = result.newly_added || 0;
    const skipped = result.skipped_count || 0;
    const rejected = result.rejected_count ?? result.banned_count ?? 0;
    const counts = currentLang === "vi"
      ? `Thêm mới: ${added}, trùng: ${skipped}, bị từ chối: ${rejected}`
      : `Added: ${added}, duplicate: ${skipped}, rejected: ${rejected}`;
    const reasons = [...(result.analysis?.errors || []), ...(result.results || []).map(r => r.error).filter(Boolean)];
    const reasonText = reasons.length ? ` ${[...new Set(reasons)].slice(0, 3).join("; ")}` : "";

    if (!res.ok || !result.success) {
      const msg = (result.error || result.message || t("uploadFailed")) + (result.error ? reasonText : "") + (rejected ? ` (${counts})` : "");
      showToast(msg, "error");
      uploadStatus.innerHTML = `<span class="text-danger">${escapeHTML(msg)}</span>`;
    } else {
      const msg = `${result.message || t("uploadSuccess")} (${counts})`;
      if (rejected > 0 || added === 0) {
        showToast(msg, "info", 6000);
        uploadStatus.innerHTML = `<span class="text-warning">${escapeHTML(msg)}</span>`;
      } else {
        showToast(msg, "success", 4500);
        uploadStatus.innerHTML = `<span class="text-success">${escapeHTML(msg)}</span>`;
      }
      if (rejected === 0) {
        selectedFiles = [];
        fileInput.value = "";
        fileNameDisplay.textContent = "";
        xmlTextInput.value = "";
        if (keyboxUrlInput) keyboxUrlInput.value = "";
      }
      await loadStatus();
      await loadKeys();
    }
  } catch (err) {
    showToast(t("connError") + ": " + err.message, "error");
    uploadStatus.innerHTML = `<span class="text-danger">${escapeHTML(err.message)}</span>`;
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
          ${currentLang === "vi" ? `Kết quả xử lý hàng loạt (thêm mới ${data.newly_added || 0}, trùng ${data.skipped_count || 0}, từ chối ${data.rejected_count ?? data.banned_count ?? 0} / ${data.total_processed})` : `Batch Processing Results (added ${data.newly_added || 0}, duplicate ${data.skipped_count || 0}, rejected ${data.rejected_count ?? data.banned_count ?? 0} of ${data.total_processed})`}
        </h4>
        <p class="text-muted" style="font-size:0.88rem; margin-top:4px;">${escapeHTML(data.message)}</p>
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
      const isRejected = !isSkipped && (item.success === false || item.status === "invalid" || item.status === "banned" || !!item.error);
      const badgeClass = isRejected ? "badge-banned" : (isSkipped ? "badge-device" : (isStrong ? "badge-strong" : (isDevice ? "badge-device" : "badge-banned")));
      const statusText = isSkipped ? (currentLang === "vi" ? "BỎ QUA (TRÙNG)" : "SKIPPED (DUP)") : (isRejected ? (currentLang === "vi" ? "TỪ CHỐI" : "REJECTED") : (item.status || "ERROR"));
      const reasons = [item.error, ...(item.analysis?.errors || [])].filter(Boolean);
      const detail = reasons.length ? [...new Set(reasons)].join("; ") : (item.message || "OK");

      html += `
        <tr>
          <td><code>${escapeHTML(item.filename)}</code></td>
          <td>${escapeHTML(item.deviceId || "N/A")}</td>
          <td>${escapeHTML(item.algorithm || "N/A")}</td>
          <td><span class="badge-tag ${badgeClass}">${statusText}</span></td>
          <td><small>${escapeHTML(detail)}</small></td>
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
    analysisResultBody.innerHTML = `<p class="text-danger">${escapeHTML(data.error || "No analysis available.")}</p>`;
    return;
  }

  const isSkipped = item.skipped;
  const isRejected = !isSkipped && (item.success === false || item.status === "invalid" || item.status === "banned" || !!item.error);
  const overall = isRejected ? "fail" : (item.analysis?.overall || (item.success ? "pass" : "fail"));
  const overallBadge = isSkipped ? `<span class="badge-tag badge-device">${currentLang === "vi" ? "BỎ QUA (TRÙNG LẶP)" : "SKIPPED (DUPLICATE)"}</span>`
                     : (overall === "pass" ? `<span class="badge-tag badge-strong">${currentLang === "vi" ? "HỢP LỆ (PASS)" : "VALID (PASS)"}</span>` 
                     : (overall === "warn" ? `<span class="badge-tag badge-device">${currentLang === "vi" ? "CẢNH BÁO (WARN)" : "WARNING (WARN)"}</span>` 
                     : `<span class="badge-tag badge-banned">${currentLang === "vi" ? "THU HỒI / LỖI (FAIL)" : "REVOKED / ERROR (FAIL)"}</span>`));

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
      <div>
        <strong>${currentLang === "vi" ? "Đánh giá tổng quan:" : "Overall Evaluation:"}</strong> ${overallBadge}
        <span style="margin-left: 14px;"><strong>${currentLang === "vi" ? "Trạng thái:" : "Status:"}</strong> <span class="badge-tag badge-${item.status === "strong" || item.status === "device" ? item.status : "banned"}">${escapeHTML(item.status || "invalid")}</span></span>
      </div>
      <div><strong>Device ID:</strong> <code>${escapeHTML(item.deviceId || "N/A")}</code></div>
    </div>
  `;

  if (item.message) {
    html += `<div class="result-item text-primary"><strong>${currentLang === "vi" ? "Thông báo:" : "Message:"}</strong> ${escapeHTML(item.message)}</div>`;
  }

  if (item.error) {
    html += `<div class="result-item text-danger"><strong>${currentLang === "vi" ? "Lỗi:" : "Error:"}</strong> ${escapeHTML(item.error)}</div>`;
  }

  if (item.analysis?.errors?.length) {
    html += `
      <div class="result-item text-danger">
        <strong>${currentLang === "vi" ? "Lỗi kiểm tra:" : "Verification Errors:"}</strong>
        <ul>${item.analysis.errors.map(e => `<li>${escapeHTML(e)}</li>`).join("")}</ul>
      </div>
    `;
  }

  if (item.analysis?.warnings?.length) {
    html += `
      <div class="result-item text-warning">
        <strong>${currentLang === "vi" ? "Cảnh báo:" : "Warnings:"}</strong>
        <ul>${item.analysis.warnings.map(w => `<li>${escapeHTML(w)}</li>`).join("")}</ul>
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
      const an = data.analysis;
      const anBad = an && (an.overall === "fail" || data.status === "invalid" || data.status === "banned");
      const anText = an ? (currentLang === "vi" ? ` Kiểm tra chứng chỉ: ${an.overall || data.status || "?"}.` : ` Certificate check: ${an.overall || data.status || "?"}.`) : "";
      const anErr = (an?.errors || []).slice(0, 3).join("; ");
      repairStatus.innerHTML = `<span class="${anBad ? "text-warning" : "text-success"}">${escapeHTML(t("repairSuccessToast") + anText + (anErr ? " " + anErr : ""))}</span>`;
      showToast(t("repairSuccessToast") + anText, anBad ? "info" : "success", anBad ? 6000 : undefined);

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
        repairFixesList.innerHTML = (data.fixesApplied || []).map(f => `<li>${escapeHTML(f)}</li>`).join("");
      }

      if (repairXmlCode) {
        repairXmlCode.textContent = data.repairedXml;
      }

      if (repairOutputPanel) {
        repairOutputPanel.classList.remove("hidden");
        repairOutputPanel.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err) {
      repairStatus.innerHTML = `<span class="text-danger">${escapeHTML(err.message)}</span>`;
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

// Initial load & Setup Language
applyLanguage(currentLang);
loadKeys();
const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
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
let refreshTimer;
function setRefreshInterval(seconds) {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    loadStatus();
    loadKeys();
    loadSources();
    loadLogs();
  }, seconds * 1000);
}
setRefreshInterval(60);
window.addEventListener('keybox-settings', event => {
  setRefreshInterval(event.detail.intervals.browser_seconds);
  const cycle = document.querySelector('[data-i18n="metaCycleVal"]');
  if (cycle) {
    delete cycle.dataset.i18n;
    cycle.textContent = currentLang === 'vi' ? 'Theo cấu hình quản trị' : 'Managed schedule';
  }
});

function initAdblockDetection() {
  if (sessionStorage.getItem('keybox_adblock_dismissed') === '1') return;

  function showModal() {
    if (document.getElementById('adblock-modal') || sessionStorage.getItem('keybox_adblock_dismissed') === '1') return;
    const backdrop = document.createElement('div');
    backdrop.id = 'adblock-modal';
    backdrop.className = 'adblock-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'adblock-modal-title');

    backdrop.innerHTML = `
      <div class="adblock-modal-card">
        <div class="adblock-icon-wrap" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h2 id="adblock-modal-title" class="adblock-title" data-i18n="adblockTitle">${t('adblockTitle')}</h2>
        <p class="adblock-message" data-i18n="adblockDesc">${t('adblockDesc')}</p>
        <div class="adblock-actions">
          <button type="button" class="adblock-btn-confirm" id="btn-adblock-confirm">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span data-i18n="adblockTurnedOff">${t('adblockTurnedOff')}</span>
          </button>
          <button type="button" class="adblock-btn-skip" id="btn-adblock-skip">
            <span data-i18n="adblockSkip">${t('adblockSkip')}</span>
          </button>
        </div>
      </div>
    `;

    document.body.append(backdrop);
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
    });

    document.getElementById('btn-adblock-confirm')?.addEventListener('click', () => {
      window.location.reload();
    });

    document.getElementById('btn-adblock-skip')?.addEventListener('click', () => {
      sessionStorage.setItem('keybox_adblock_dismissed', '1');
      backdrop.classList.remove('show');
      setTimeout(() => backdrop.remove(), 250);
    });
  }

  setTimeout(async () => {
    let detected = false;

    // Test 1: Bait DOM element with common ad classes
    const bait = document.createElement('div');
    bait.className = 'ad-banner adsbox pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links';
    bait.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;';
    document.body.append(bait);

    const styles = window.getComputedStyle(bait);
    if (
      bait.offsetParent === null ||
      bait.offsetHeight === 0 ||
      styles.display === 'none' ||
      styles.visibility === 'hidden'
    ) {
      detected = true;
    }
    bait.remove();

    // Test 2: Network fetch test to a standard ad network script
    if (!detected) {
      try {
        const req = new Request('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store'
        });
        await fetch(req);
      } catch {
        detected = true;
      }
    }

    if (detected) {
      showModal();
    }
  }, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdblockDetection);
} else {
  initAdblockDetection();
}

