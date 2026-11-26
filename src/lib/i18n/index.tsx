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
  english: 'English',
  portugueseBr: 'Português (Brasil)',

  // Home
  studentTitle: 'Student',
  showMyLiveQr: 'Show My Live QR',
  studentRegistration: 'Student Registration',
  lostPhoneRecover: 'Lost Phone / Key Recovery',
  teacherTitle: 'Teacher',
  openTeacherClasses: 'Open Teacher Classes',
  teacherPasskeySignIn: 'Teacher Passkey Sign In',
  installPwaTitle: 'Install as an App',
  installPwaDesc:
    'On iOS Safari tap Share → Add to Home Screen. On Android Chrome or Desktop tap Install App in the address bar or header so offline cold-starts work reliably.',

  // Selfie Capture
  selfieLabel: 'Live Selfie Photo (WebP HD, max 1 MB)',
  encodedSummary: 'Encoded',
  retakeSelfie: 'Retake Selfie',
  capturePhoto: 'Capture Photo',
  cancel: 'Cancel',
  openFrontCamera: 'Open Front Camera',
  uploadPhoto: 'Take / Upload Photo',
  cameraUnavailable: 'Camera API unavailable. Please upload a photo instead.',
  cameraAccessError:
    'Could not access front camera. Check permissions or upload a photo.',
  selfieDecodeError: 'Failed to decode selected image.',
  selfieProcessError: 'Failed to process photo.',
  capturedSelfieAlt: 'Captured student selfie',

  // Student Register
  alreadyRegisteredTitle: 'Student Device Already Registered',
  alreadyRegisteredBody:
    'Your non-extractable signing key is locked in this browser.',
  registeredAs: 'Registered as',
  openLiveQr: 'Open Live QR',
  rotateRecoverKey: 'Rotate / Recover Key',
  studentRegSubtitle:
    'One-time setup. Your signing key never leaves this device.',
  schoolStudentId: 'School Student ID',
  schoolStudentIdPlaceholder: 'e.g. A12345678',
  fullName: 'Full Name',
  fullNamePlaceholder: 'e.g. Jane Doe',
  completeRegistration: 'Complete Registration',
  generatingKey: 'Generating Key & Registering…',
  lostPhoneLink: 'Lost phone or cleared data? Recover key',
  errMissingIdName: 'Please enter both your School Student ID and Full Name.',
  errMissingSelfie: 'Please capture or upload a selfie photo.',
  errExistingKey:
    'A key already exists on this device. Open your QR or use Recovery if needed.',
  errDuplicateSid:
    'This School Student ID is already registered. If you got a new phone or cleared storage, use Key Recovery.',
  errRegFailed: 'Student registration failed.',
  regSuccess:
    'Registration complete. Your teacher will add you when they scan your QR.',

  // Student QR
  loadingStudentCreds: 'Loading student credentials…',
  qrAriaLabel: 'Live signed student attendance QR code',
  recoveryQrBanner:
    'Recovery QR Active: Show this QR to your teacher so they can approve your new key during the scan.',
  pendingUploadBanner:
    'Selfie upload pending: Connect to the internet once so your photo finishes uploading to Firebase Storage before your teacher’s first scan.',
  uploadNow: 'Sync Photo Now',
  live: 'Live',
  refreshesIn: 'refreshes in {seconds}s',
  signedEcdsa: 'bytes signed ECDSA P-256',
  idLabel: 'ID',
  keyFp: 'Key FP',
  refreshNow: 'Refresh Now',
  keyRecovery: 'Key Recovery',

  // Student Recover
  studentRecoverTitle: 'Student Key Recovery',
  studentRecoverSubtitle:
    'Lost your phone or cleared browser data? Generate a new device key and show the resulting QR to your teacher.',
  studentRecoverWarning:
    'An internet connection is needed to upload your new photo, and your teacher must be online the first time they scan your recovered QR to approve the key rotation.',
  errRecoverSelfie:
    'Capture a new live selfie so your teacher can verify your identity.',
  errRecoverFailed: 'Failed to prepare key recovery.',
  generateRecoveryQr: 'Generate Recovery QR',
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

  // Teacher Classes
  yourClasses: 'Your Classes',
  classesSubtitle:
    'Students join a class automatically the first time you scan their QR.',
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

  // Teacher Scan
  scanAttendanceTitle: 'Scan Attendance',
  sessionDate: 'Session date',
  presentCount: 'present',
  scanPhoto: 'Scan Photo',
  offlineScanBanner:
    'Offline mode active: returning students verify and queue locally. First scans and key rotations require internet.',
  alreadyRecordedToday: 'Already recorded today',
  selfieMismatchWarn:
    'Selfie hash differs from stored record. Verify student’s face visually.',
  startingCamera: 'Starting camera…',
  cameraScanErr:
    'Unable to access rear camera. Grant camera permissions or upload a QR image.',
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
  exportSubtitle:
    'Generated completely in-browser from local IndexedDB cache. Works offline.',
  selectClasses: 'Select Classes',
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
  english: 'English',
  portugueseBr: 'Português (Brasil)',

  // Home
  studentTitle: 'Aluno',
  showMyLiveQr: 'Mostrar Meu QR ao Vivo',
  studentRegistration: 'Cadastro de Aluno',
  lostPhoneRecover: 'Perdi o Celular / Recuperar Chave',
  teacherTitle: 'Professor',
  openTeacherClasses: 'Abrir Minhas Turmas',
  teacherPasskeySignIn: 'Entrar com Passkey',
  installPwaTitle: 'Instalar como App',
  installPwaDesc:
    'No Safari (iOS), toque em Compartilhar → Adicionar à Tela de Início. No Chrome (Android ou Desktop), toque em Instalar App na barra ou cabeçalho para abrir offline sem falhas.',

  // Selfie Capture
  selfieLabel: 'Foto Selfie ao Vivo (WebP HD, máx. 1 MB)',
  encodedSummary: 'Codificada',
  retakeSelfie: 'Tirar Outra Foto',
  capturePhoto: 'Capturar Foto',
  cancel: 'Cancelar',
  openFrontCamera: 'Abrir Câmera Frontal',
  uploadPhoto: 'Tirar / Enviar Foto',
  cameraUnavailable: 'API de câmera indisponível. Envie uma foto no lugar.',
  cameraAccessError:
    'Não foi possível acessar a câmera frontal. Verifique as permissões ou envie uma foto.',
  selfieDecodeError: 'Não foi possível decodificar a imagem selecionada.',
  selfieProcessError: 'Falha ao processar a foto.',
  capturedSelfieAlt: 'Selfie capturada do aluno',

  // Student Register
  alreadyRegisteredTitle: 'Dispositivo do Aluno Já Cadastrado',
  alreadyRegisteredBody:
    'Sua chave de assinatura não-exportável está protegida neste navegador.',
  registeredAs: 'Cadastrado como',
  openLiveQr: 'Abrir QR ao Vivo',
  rotateRecoverKey: 'Trocar / Recuperar Chave',
  studentRegSubtitle:
    'Configuração única. Sua chave privada nunca sai deste dispositivo.',
  schoolStudentId: 'Matrícula / ID Escolar',
  schoolStudentIdPlaceholder: 'ex.: A12345678',
  fullName: 'Nome Completo',
  fullNamePlaceholder: 'ex.: Maria Silva',
  completeRegistration: 'Concluir Cadastro',
  generatingKey: 'Gerando Chave e Cadastrando…',
  lostPhoneLink: 'Trocou de celular ou limpou os dados? Recuperar chave',
  errMissingIdName: 'Informe sua Matrícula/ID Escolar e seu Nome Completo.',
  errMissingSelfie: 'Capture ou envie uma foto selfie.',
  errExistingKey:
    'Já existe uma chave neste dispositivo. Abra seu QR ou use Recuperação.',
  errDuplicateSid:
    'Esta matrícula já está cadastrada. Se você trocou de celular ou limpou o navegador, use Recuperar Chave.',
  errRegFailed: 'Falha ao cadastrar aluno.',
  regSuccess:
    'Cadastro concluído. Seu professor adicionará você à turma ao ler seu QR.',

  // Student QR
  loadingStudentCreds: 'Carregando credenciais do aluno…',
  qrAriaLabel: 'QR code de presença assinado e ao vivo do aluno',
  recoveryQrBanner:
    'QR de Recuperação Ativo: Mostre este QR ao professor para aprovar sua nova chave durante a leitura.',
  pendingUploadBanner:
    'Envio da foto pendente: Conecte-se à internet uma vez para concluir o envio da sua foto ao Firebase Storage antes da primeira leitura.',
  uploadNow: 'Enviar Foto Agora',
  live: 'Ao vivo',
  refreshesIn: 'atualiza em {seconds}s',
  signedEcdsa: 'bytes assinados ECDSA P-256',
  idLabel: 'Matrícula',
  keyFp: 'Impressão da Chave',
  refreshNow: 'Atualizar Agora',
  keyRecovery: 'Recuperar Chave',

  // Student Recover
  studentRecoverTitle: 'Recuperação de Chave do Aluno',
  studentRecoverSubtitle:
    'Perdeu o celular ou limpou os dados do navegador? Gere uma nova chave neste aparelho e mostre o QR ao professor.',
  studentRecoverWarning:
    'É necessária conexão com a internet para enviar sua nova foto, e o professor deve estar online na primeira leitura para aprovar a troca de chave.',
  errRecoverSelfie:
    'Tire uma nova selfie ao vivo para que o professor confirme sua identidade.',
  errRecoverFailed: 'Falha ao preparar a recuperação da chave.',
  generateRecoveryQr: 'Gerar QR de Recuperação',
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

  // Teacher Classes
  yourClasses: 'Suas Turmas',
  classesSubtitle:
    'Os alunos entram na turma automaticamente na primeira vez que você lê o QR deles.',
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

  // Teacher Scan
  scanAttendanceTitle: 'Fazer Chamada',
  sessionDate: 'Data da aula',
  presentCount: 'presentes',
  scanPhoto: 'Ler Foto',
  offlineScanBanner:
    'Modo offline ativo: alunos já conhecidos são validados e salvos localmente. Primeiras leituras e trocas de chave exigem internet.',
  alreadyRecordedToday: 'Já registrado hoje',
  selfieMismatchWarn:
    'O hash da foto difere do registro salvo. Confirme o rosto do aluno visualmente.',
  startingCamera: 'Iniciando câmera…',
  cameraScanErr:
    'Não foi possível acessar a câmera traseira. Conceda permissão ou envie uma foto do QR.',
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
  exportSubtitle:
    'Gerado totalmente no navegador a partir do cache local (IndexedDB). Funciona offline.',
  selectClasses: 'Selecionar Turmas',
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
