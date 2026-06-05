export type FormState = "idle" | "loading" | "success" | "error";
export type DictationField = "task" | "success";

export type IntakeSpeechRecognitionResult = {
  readonly length: number;
  item(index: number): { transcript: string } | undefined;
  [index: number]: { transcript: string } | undefined;
};

export type IntakeSpeechRecognitionEvent = {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    item(index: number): IntakeSpeechRecognitionResult;
    [index: number]: IntakeSpeechRecognitionResult;
  };
};

export type IntakeSpeechRecognitionErrorEvent = {
  readonly error?: string;
};

export type IntakeSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onend: (() => void) | null;
  onerror: ((event: IntakeSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: IntakeSpeechRecognitionEvent) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

export type IntakeSpeechRecognitionConstructor = new () => IntakeSpeechRecognition;

export type IntakeFields = {
  name: string;
  email: string;
  toolsOrSystems: string[];
  processInvolvement: string;
  task: string;
  success: string;
  anythingElse: string;
};

export type UploadedFile = {
  name: string;
  filename: string;
  pathname: string;
  size: number;
  content_type: string;
  blob_file_path: string;
  blob_file_name: string;
  blob_file_size: number;
  blob_file_content_type: string;
};

export type IntakeSubmission = {
  name: string;
  email: string;
  toolsOrSystems: string[];
  processInvolvement: string;
  task: string;
  success: string;
  anythingElse: string;
  uploadedFiles: UploadedFile[];
  uploadedSuccessFiles: UploadedFile[];
};
