import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Locale = 'en' | 'pt-BR';

const LOCALE_STORAGE_KEY = 'app-locale';

export function detectInitialLocale(): Locale {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'en' || saved === 'pt-BR') {
      return saved;
    }
    const candidates = navigator.languages?.length
      ? navigator.languages
      : [navigator.language];
    for (const lang of candidates) {
      if (lang?.toLowerCase().startsWith('pt')) {
        return 'pt-BR';
      }
    }
  }
  return 'en';
}

const en = {
  appName: 'Class Attendance',
  online: 'Online',
  offline: 'Offline',
  installApp: 'Install App',
  classes: 'Classes',
  export: 'Export',
  signOut: 'Sign out',
  language: 'Language',
  options: 'Options',
  theme: 'Theme',
  createdBy: 'Created by',
  light: 'Light',
  dark: 'Dark',
  english: 'English',
  portugueseBr: 'Português (Brasil)',

  // Home
  studentTitle: 'Student',
  showMyLiveQr: 'Show My Live QR',
  studentRegistration: 'Student Registration',
  lostPhoneRecover: 'Lost Phone / Regenerate Key',
  teacherTitle: 'Teacher',
  openTeacherClasses: 'Open Teacher Classes',
  teacherPasskeySignIn: 'Teacher Passkey Sign In',
  installPwaTitle: 'Install as an App',
  installPwaDesc:
    'On iOS Safari tap Share → Add to Home Screen. On Android Chrome or Desktop tap Install App in the address bar or header so offline cold-starts work reliably.',

  // Selfie Capture
  selfieLabel: 'Live Selfie Photo',
  encodedSummary: 'Encoded',
  retakeSelfie: 'Retake Selfie',
  capturePhoto: 'Capture Photo',
  cancel: 'Cancel',
  openFrontCamera: 'Open Front Camera',
  cameraUnavailable: 'Camera API unavailable in this browser.',
  cameraAccessError:
    'Could not access the front camera. Check permissions and try again.',
  selfieProcessError: 'Failed to process photo.',
  selfieBlankError:
    'That photo looks blank, too dark, or too bright. Make sure your face is visible and try again.',
  capturedSelfieAlt: 'Captured student selfie',

  // Student Register
  alreadyRegisteredTitle: 'Student Device Already Registered',
  alreadyRegisteredBody:
    'Your non-extractable signing key is locked in this browser.',
  registeredAs: 'Registered as',
  openLiveQr: 'Open Live QR',
  rotateRecoverKey: 'Rotate / Regenerate Key',
  studentRegSubtitle:
    'One-time setup. Your signing key never leaves this device.',
  schoolStudentId: 'School Student ID',
  schoolStudentIdPlaceholder: 'e.g. A12345678',
  fullName: 'Full Name',
  fullNamePlaceholder: 'e.g. Jane Doe',
  completeRegistration: 'Complete Registration',
  generatingKey: 'Generating Key & Registering…',
  lostPhoneLink: 'Lost phone or cleared data? Regenerate key',
  errMissingIdName: 'Please enter both your School Student ID and Full Name.',
  errMissingSelfie: 'Please capture or upload a selfie photo.',
  errExistingKey:
    'A key already exists on this device. Open your QR or regenerate your key if needed.',
  errRegFailed: 'Student registration failed.',
  regSuccess:
    'Registration complete. Your teacher will add you when they scan your QR.',

  // Student QR
  loadingStudentCreds: 'Loading student credentials…',
  qrAriaLabel: 'Live signed student attendance QR code',
  recoveryQrBanner:
    'New Key QR Active: Show this QR to your teacher so they can approve your new key during the scan.',
  pendingUploadBanner:
    'Selfie upload pending: Connect to the internet once so your photo finishes uploading to Firebase Storage before your teacher’s first scan.',
  uploadNow: 'Sync Photo Now',
  live: 'Live',
  refreshesIn: 'refreshes in {seconds}s',
  idLabel: 'ID',
  keyFp: 'Key FP',
  refreshNow: 'Refresh Now',
  keyRecovery: 'Regenerate Key',

  // Student Recover
  studentRecoverTitle: 'Regenerate Student Key',
  studentRecoverSubtitle:
    'Lost your phone or cleared browser data? Generate a new device key and show the resulting QR to your teacher.',
  studentRecoverWarning:
    'An internet connection is needed to upload your new photo, and your teacher must be online the first time they scan your new QR to approve the key rotation.',
  errRecoverSelfie:
    'Capture a new live selfie so your teacher can verify your identity.',
  errRecoverFailed: 'Failed to prepare key regeneration.',
  generateRecoveryQr: 'Generate New Key QR',
  generatingNewKey: 'Generating New Key…',
  backToRegistration: 'Back to Registration',

  // Teacher Auth
  verifyingSession: 'Verifying teacher session…',
  passkeyUnsupported:
    'WebAuthn passkeys are not supported in this browser or context (HTTPS is required).',
  passkeyOffline:
    'You are currently offline. Signing in with a passkey requires an internet connection to mint a session token.',
  waitingPasskey: 'Waiting for Passkey…',
  signInPasskey: 'Sign in with Passkey',
  createTeacherAccount: 'Create Teacher Account',
  teacherDisplayNameLabel: 'Display Name (shown on your passkey prompt)',
  teacherDisplayNamePlaceholder: 'e.g. Prof. Rivera',
  creatingPasskey: 'Creating Passkey Account…',
  createAccountPasskey: 'Create account with Passkey',
  turnstileError: 'Bot check could not complete.',
  turnstileRetry: 'Retry',
  securityCheckTitle: 'Security check',
  securityCheckBody: 'Confirm you are human to continue.',
  devTestLogin: 'Dev test login',

  // Teacher Classes
  yourClasses: 'Your Classes',
  exportXlsx: 'Export XLSX',
  createNewClass: 'Create New Class',
  classNamePlaceholder: 'e.g. Biology 12 – Group A',
  creatingClass: 'Creating…',
  createClass: 'Create Class',
  loadingClasses: 'Loading classes…',
  noClassesYet:
    'No classes yet. Create your first class above, then start scanning student QRs.',
  studentSingular: 'student',
  studentPlural: 'students',
  roster: 'Roster',
  scanAttendance: 'Scan Attendance',
  loadingRoster: 'Loading roster from cache…',
  noStudentsInClass:
    'No students in this class yet. Scan a student’s QR while online to add them.',
  recordedSessions: 'Recorded sessions',
  moreActions: 'More actions',
  rename: 'Rename',
  archive: 'Archive',
  unarchive: 'Unarchive',
  archived: 'Archived',
  save: 'Save',
  showArchived: 'Show archived ({count})',
  hideArchived: 'Hide archived',
  errClassRename: 'Could not rename the class. Please try again.',
  errClassArchive: 'Could not archive the class. Please try again.',
  errClassOffline: 'Managing classes requires an internet connection.',

  // Teacher Scan
  scanAttendanceTitle: 'Scan Attendance',
  sessionDate: 'Session date',
  presentCount: 'present',
  offlineScanBanner:
    'Offline mode active: returning students verify and queue locally. First scans and key rotations require internet.',
  alreadyRecordedToday: 'Already recorded today',
  selfieMismatchWarn:
    'Selfie hash differs from stored record. Verify student’s face visually.',
  startingCamera: 'Starting camera…',
  cameraScanErr:
    'Unable to access the rear camera. Grant camera permissions and try again.',
  retryCamera: 'Retry camera',
  scanInstruction: 'Point the camera at the student’s live rotating QR code.',
  presentToday: 'Present Today',
  noStudentsScannedToday: 'No students scanned yet today.',
  rotationTitle: 'Key Rotation Approval',
  rotationPrompt: 'This student’s key has changed. Approve new key for',
  storedSelfie: 'Stored Selfie',
  newQrSelfie: 'New QR Selfie',
  storedSelfieAlt: 'Previous student selfie',
  newSelfieAlt: 'New student selfie',
  oldFp: 'Old FP',
  newFp: 'New FP',
  reject: 'Reject',
  approving: 'Approving…',
  approveAndRecord: 'Approve New Key & Record',

  // Scan Pipeline Messages
  scanAddedAndRecorded: 'Added {name} to class and recorded attendance.',
  scanRecorded: 'Attendance recorded for {name}.',
  scanDuplicate: '{name} is already marked present today (duplicate scan ignored).',
  scanRejectedMismatch: 'Scan rejected — key mismatch.',
  errMalformedQr: 'Malformed QR payload.',
  errFirstScanOffline:
    'First scan requires internet. Please connect once to register this student.',
  errFirstScanFailed: 'Failed to register student on first scan.',
  errRotationOffline: 'Key rotation requires internet. Please connect.',
  errInvalidSignature: 'Invalid cryptographic signature.',
  errExpiredQr: 'QR code expired (older than 180 seconds). Ask student to show live QR.',
  errRotationFailed: 'Key rotation approval failed.',
  errRotationOldApp:
    'The student app is outdated. Ask the student to reload it, then scan the live QR again.',
  errRotationExpired:
    'This QR expired while you reviewed it. Scan the student’s live QR again.',
  errRotationReplayed: 'This QR was already used. Scan a fresh QR.',
  errRotationName: 'The student name on the QR does not match the record.',
  errRotationSelfie:
    'The new selfie does not match the QR. Ask the student to capture it again.',
  errRotationSignature: 'The QR signature is invalid.',
  errSelfieFetchFailed: 'Could not download student selfie from Firebase Storage.',
  errNameMismatch: 'QR student name does not match registered record.',
  errSelfieHashMismatch: 'QR selfie hash does not match registered record.',
  errReplayedNonce: 'Duplicate QR nonce detected (replay rejected).',
  errTurnstileRequired: 'Please complete the human verification check first.',

  // Operation errors
  errQrGenerate: 'Could not generate the QR code. Please try again.',
  errPasskeyLoginFailed: 'Passkey sign-in failed. Please try again.',
  errPasskeyRegisterFailed:
    'Could not create the passkey account. Please try again.',
  errBotVerification: 'Bot verification failed. Please try again.',
  errClassCreate: 'Could not create the class. Please try again.',
  errExportFailed: 'Could not export the spreadsheet. Please try again.',
  errSelfieUpload:
    'Could not upload the photo. Check your connection and try again.',
  errSelfieTooLarge:
    'The photo is still over 1 MB after compression. Try another photo.',
  errSelfieEncode: 'Could not process the photo. Please try again.',

  // Export
  exportTitle: 'Export Attendance (XLSX)',
  selectClasses: 'Select Classes',
  selectAll: 'Select all',
  selectNone: 'Clear selection',
  noCachedClasses: 'No cached classes available yet.',
  allTime: 'All time',
  fromDate: 'From Date',
  toDate: 'To Date',
  includeSummary: 'Include “Summary” sheet across selected classes',
  buildingXlsx: 'Building XLSX…',
  downloadXlsx: 'Download Attendance XLSX',
  selectOneClassError: 'Select at least one class to export.',
  exportSuccess: 'Exported {filename} ({count} class sheets).',
  exportSuccessOne: 'Exported {filename} (1 class sheet).',

  // Excel columns
  colStudentId: 'Student ID',
  colName: 'Name',
  colPresencePct: 'Presence %',
  colClass: 'Class',
  colScanned: 'Scanned',
  colTotalSessions: 'Total Sessions',
  sheetSummary: 'Summary',
  tapToZoom: 'Tap photo to zoom',
  closeZoom: 'Close zoomed photo',
} as const;

export type TranslationKey = keyof typeof en;

const ptBR: Record<TranslationKey, string> = {
  appName: 'Presença na Sala',
  online: 'Online',
  offline: 'Offline',
  installApp: 'Instalar App',
  classes: 'Turmas',
  export: 'Exportar',
  signOut: 'Sair',
  language: 'Idioma',
  options: 'Opções',
  theme: 'Tema',
  createdBy: 'Criado por',
  light: 'Claro',
  dark: 'Escuro',
  english: 'English',
  portugueseBr: 'Português (Brasil)',

  // Home
  studentTitle: 'Aluno',
  showMyLiveQr: 'Mostrar Meu QR ao Vivo',
  studentRegistration: 'Cadastro de Aluno',
  lostPhoneRecover: 'Perdi o Celular / Regenerar Chave',
  teacherTitle: 'Professor',
  openTeacherClasses: 'Abrir Minhas Turmas',
  teacherPasskeySignIn: 'Entrar com Passkey',
  installPwaTitle: 'Instalar como App',
  installPwaDesc:
    'No Safari (iOS), toque em Compartilhar → Adicionar à Tela de Início. No Chrome (Android ou Desktop), toque em Instalar App na barra ou cabeçalho para abrir offline sem falhas.',

  // Selfie Capture
  selfieLabel: 'Foto Selfie ao Vivo',
  encodedSummary: 'Codificada',
  retakeSelfie: 'Tirar Outra Foto',
  capturePhoto: 'Capturar Foto',
  cancel: 'Cancelar',
  openFrontCamera: 'Abrir Câmera Frontal',
  cameraUnavailable: 'API de câmera indisponível neste navegador.',
  cameraAccessError:
    'Não foi possível acessar a câmera frontal. Verifique as permissões e tente novamente.',
  selfieProcessError: 'Falha ao processar a foto.',
  selfieBlankError:
    'A foto parece vazia, escura ou clara demais. Verifique se seu rosto está visível e tente novamente.',
  capturedSelfieAlt: 'Selfie capturada do aluno',

  // Student Register
  alreadyRegisteredTitle: 'Dispositivo do Aluno Já Cadastrado',
  alreadyRegisteredBody:
    'Sua chave de assinatura não-exportável está protegida neste navegador.',
  registeredAs: 'Cadastrado como',
  openLiveQr: 'Abrir QR ao Vivo',
  rotateRecoverKey: 'Trocar / Regenerar Chave',
  studentRegSubtitle:
    'Configuração única. Sua chave privada nunca sai deste dispositivo.',
  schoolStudentId: 'Matrícula / ID Escolar',
  schoolStudentIdPlaceholder: 'ex.: A12345678',
  fullName: 'Nome Completo',
  fullNamePlaceholder: 'ex.: Maria Silva',
  completeRegistration: 'Concluir Cadastro',
  generatingKey: 'Gerando Chave e Cadastrando…',
  lostPhoneLink: 'Trocou de celular ou limpou os dados? Regenerar chave',
  errMissingIdName: 'Informe sua Matrícula/ID Escolar e seu Nome Completo.',
  errMissingSelfie: 'Capture ou envie uma foto selfie.',
  errExistingKey:
    'Já existe uma chave neste dispositivo. Abra seu QR ou regenere sua chave se necessário.',
  errRegFailed: 'Falha ao cadastrar aluno.',
  regSuccess:
    'Cadastro concluído. Seu professor adicionará você à turma ao ler seu QR.',

  // Student QR
  loadingStudentCreds: 'Carregando credenciais do aluno…',
  qrAriaLabel: 'QR code de presença assinado e ao vivo do aluno',
  recoveryQrBanner:
    'QR de Nova Chave Ativo: Mostre este QR ao professor para aprovar sua nova chave durante a leitura.',
  pendingUploadBanner:
    'Envio da foto pendente: Conecte-se à internet uma vez para concluir o envio da sua foto ao Firebase Storage antes da primeira leitura.',
  uploadNow: 'Enviar Foto Agora',
  live: 'Ao vivo',
  refreshesIn: 'atualiza em {seconds}s',
  idLabel: 'Matrícula',
  keyFp: 'Impressão da Chave',
  refreshNow: 'Atualizar Agora',
  keyRecovery: 'Regenerar Chave',

  // Student Recover
  studentRecoverTitle: 'Regenerar Chave do Aluno',
  studentRecoverSubtitle:
    'Perdeu o celular ou limpou os dados do navegador? Gere uma nova chave neste aparelho e mostre o QR ao professor.',
  studentRecoverWarning:
    'É necessária conexão com a internet para enviar sua nova foto, e o professor deve estar online na primeira leitura para aprovar a troca de chave.',
  errRecoverSelfie:
    'Tire uma nova selfie ao vivo para que o professor confirme sua identidade.',
  errRecoverFailed: 'Falha ao preparar a regeneração da chave.',
  generateRecoveryQr: 'Gerar QR de Nova Chave',
  generatingNewKey: 'Gerando Nova Chave…',
  backToRegistration: 'Voltar ao Cadastro',

  // Teacher Auth
  verifyingSession: 'Verificando sessão do professor…',
  passkeyUnsupported:
    'Passkeys (WebAuthn) não são compatíveis com este navegador ou contexto (HTTPS obrigatório).',
  passkeyOffline:
    'Você está offline. Entrar com passkey exige conexão com a internet para emitir o token da sessão.',
  waitingPasskey: 'Aguardando Passkey…',
  signInPasskey: 'Entrar com Passkey',
  createTeacherAccount: 'Criar Conta de Professor',
  teacherDisplayNameLabel: 'Nome de Exibição (mostrado no prompt da passkey)',
  teacherDisplayNamePlaceholder: 'ex.: Prof. Bottaro',
  creatingPasskey: 'Criando Conta com Passkey…',
  createAccountPasskey: 'Criar conta com Passkey',
  turnstileError: 'Não foi possível concluir a verificação anti-robô.',
  turnstileRetry: 'Tentar novamente',
  securityCheckTitle: 'Verificação de segurança',
  securityCheckBody: 'Confirme que você é humano para continuar.',
  devTestLogin: 'Login de teste (dev)',

  // Teacher Classes
  yourClasses: 'Suas Turmas',
  exportXlsx: 'Exportar XLSX',
  createNewClass: 'Criar Nova Turma',
  classNamePlaceholder: 'ex.: Biologia 12 – Turma A',
  creatingClass: 'Criando…',
  createClass: 'Criar Turma',
  loadingClasses: 'Carregando turmas…',
  noClassesYet:
    'Nenhuma turma ainda. Crie sua primeira turma acima e comece a ler os QR codes.',
  studentSingular: 'aluno',
  studentPlural: 'alunos',
  roster: 'Lista de Alunos',
  scanAttendance: 'Fazer Chamada',
  loadingRoster: 'Carregando turma do cache…',
  noStudentsInClass:
    'Nenhum aluno nesta turma ainda. Leia o QR de um aluno estando online para adicioná-lo.',
  recordedSessions: 'Aulas registradas',
  moreActions: 'Mais ações',
  rename: 'Renomear',
  archive: 'Arquivar',
  unarchive: 'Desarquivar',
  archived: 'Arquivada',
  save: 'Salvar',
  showArchived: 'Mostrar arquivadas ({count})',
  hideArchived: 'Ocultar arquivadas',
  errClassRename: 'Não foi possível renomear a turma. Tente novamente.',
  errClassArchive: 'Não foi possível arquivar a turma. Tente novamente.',
  errClassOffline: 'Gerenciar turmas exige conexão com a internet.',

  // Teacher Scan
  scanAttendanceTitle: 'Fazer Chamada',
  sessionDate: 'Data da aula',
  presentCount: 'presentes',
  offlineScanBanner:
    'Modo offline ativo: alunos já conhecidos são validados e salvos localmente. Primeiras leituras e trocas de chave exigem internet.',
  alreadyRecordedToday: 'Já registrado hoje',
  selfieMismatchWarn:
    'O hash da foto difere do registro salvo. Confirme o rosto do aluno visualmente.',
  startingCamera: 'Iniciando câmera…',
  cameraScanErr:
    'Não foi possível acessar a câmera traseira. Conceda permissão e tente novamente.',
  retryCamera: 'Tentar novamente a câmera',
  scanInstruction: 'Aponte a câmera para o QR code ao vivo do aluno.',
  presentToday: 'Presentes Hoje',
  noStudentsScannedToday: 'Nenhum aluno lido hoje ainda.',
  rotationTitle: 'Aprovação de Troca de Chave',
  rotationPrompt: 'A chave deste aluno mudou. Aprovar nova chave para',
  storedSelfie: 'Foto Anterior',
  newQrSelfie: 'Nova Foto',
  storedSelfieAlt: 'Foto anterior do aluno',
  newSelfieAlt: 'Nova foto do aluno',
  oldFp: 'Chave Antiga',
  newFp: 'Nova Chave',
  reject: 'Rejeitar',
  approving: 'Aprovando…',
  approveAndRecord: 'Aprovar Nova Chave e Registrar',

  // Scan Pipeline Messages
  scanAddedAndRecorded: '{name} adicionado(a) à turma e presença registrada.',
  scanRecorded: 'Presença registrada para {name}.',
  scanDuplicate: '{name} já tem presença marcada hoje (leitura duplicada ignorada).',
  scanRejectedMismatch: 'Leitura rejeitada — chave incompatível.',
  errMalformedQr: 'QR code inválido ou malformado.',
  errFirstScanOffline:
    'A primeira leitura exige internet. Conecte-se uma vez para cadastrar este aluno.',
  errFirstScanFailed: 'Falha ao cadastrar aluno na primeira leitura.',
  errRotationOffline: 'A troca de chave exige internet. Conecte-se primeiro.',
  errInvalidSignature: 'Assinatura criptográfica inválida.',
  errExpiredQr: 'QR code expirado (mais de 180 segundos). Peça ao aluno o QR ao vivo.',
  errRotationFailed: 'Falha ao aprovar troca de chave.',
  errRotationOldApp:
    'O aplicativo do aluno está desatualizado. Peça para recarregar e leia o QR ao vivo novamente.',
  errRotationExpired:
    'Este QR expirou enquanto você revisava. Leia o QR ao vivo do aluno novamente.',
  errRotationReplayed: 'Este QR já foi usado. Leia um QR novo.',
  errRotationName: 'O nome no QR não confere com o registro do aluno.',
  errRotationSelfie:
    'A nova selfie não confere com o QR. Peça ao aluno para capturar novamente.',
  errRotationSignature: 'A assinatura do QR é inválida.',
  errSelfieFetchFailed: 'Não foi possível baixar a foto do aluno no Firebase Storage.',
  errNameMismatch: 'O nome no QR não confere com o registro do aluno.',
  errSelfieHashMismatch: 'O hash da foto no QR não confere com o registro do aluno.',
  errReplayedNonce: 'QR já utilizado nesta janela (repetição rejeitada).',
  errTurnstileRequired: 'Conclua a verificação anti-robô antes de continuar.',

  // Operation errors
  errQrGenerate: 'Não foi possível gerar o QR code. Tente novamente.',
  errPasskeyLoginFailed: 'Falha ao entrar com passkey. Tente novamente.',
  errPasskeyRegisterFailed:
    'Não foi possível criar a conta com passkey. Tente novamente.',
  errBotVerification: 'Falha na verificação anti-robô. Tente novamente.',
  errClassCreate: 'Não foi possível criar a turma. Tente novamente.',
  errExportFailed: 'Não foi possível exportar a planilha. Tente novamente.',
  errSelfieUpload:
    'Não foi possível enviar a foto. Verifique a conexão e tente novamente.',
  errSelfieTooLarge:
    'A foto continua acima de 1 MB após a compressão. Tente outra foto.',
  errSelfieEncode: 'Não foi possível processar a foto. Tente novamente.',

  // Export
  exportTitle: 'Exportar Chamada (XLSX)',
  selectClasses: 'Selecionar Turmas',
  selectAll: 'Selecionar todas',
  selectNone: 'Limpar seleção',
  noCachedClasses: 'Nenhuma turma em cache ainda.',
  allTime: 'Todo o período',
  fromDate: 'Data Inicial',
  toDate: 'Data Final',
  includeSummary: 'Incluir aba “Resumo” com todas as turmas selecionadas',
  buildingXlsx: 'Gerando XLSX…',
  downloadXlsx: 'Baixar Planilha XLSX',
  selectOneClassError: 'Selecione pelo menos uma turma para exportar.',
  exportSuccess: 'Exportado {filename} ({count} abas de turma).',
  exportSuccessOne: 'Exportado {filename} (1 aba de turma).',

  // Excel columns
  colStudentId: 'Matrícula',
  colName: 'Nome',
  colPresencePct: 'Presença %',
  colClass: 'Turma',
  colScanned: 'Presenças',
  colTotalSessions: 'Total de Aulas',
  sheetSummary: 'Resumo',
  tapToZoom: 'Toque na foto para ampliar',
  closeZoom: 'Fechar foto ampliada',
};

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = {
  en,
  'pt-BR': ptBR,
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    }
  };

  const t = (
    key: TranslationKey,
    vars?: Record<string, string | number>
  ): string => {
    let text = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }
    return text;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return ctx;
}

export function getTranslator(locale: Locale = detectInitialLocale()) {
  return (key: TranslationKey, vars?: Record<string, string | number>): string => {
    let text = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }
    return text;
  };
}
