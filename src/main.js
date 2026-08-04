import "./styles.css";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import {
  VRMAnimationLoaderPlugin,
  VRMLookAtQuaternionProxy,
  createVRMAnimationClip
} from "@pixiv/three-vrm-animation";
import { MMDLoader } from "three-stdlib";
import { loadDemoAssetConfig, loadStudioAssetConfig, renderAssetStatus } from "./localAssetLoader.js";

const canvas = document.querySelector("#scene");
const togglePlay = document.querySelector("#togglePlay");
const cameraModeButton = document.querySelector("#cameraMode");
const previewControls = document.querySelector("#previewControls");
const modelPresetSelect = document.querySelector("#modelPresetSelect");
const faceModelSelect = document.querySelector("#faceModelSelect");
const eyeMorphSelect = document.querySelector("#eyeMorphSelect");
const faceEmoteSelect = document.querySelector("#faceEmoteSelect");
const outfitMorphSelect = document.querySelector("#outfitMorphSelect");
const motionModeSelect = document.querySelector("#motionModeSelect");
const speechPhraseSelect = document.querySelector("#speechPhraseSelect");
const readingWpmInput = document.querySelector("#readingWpm");
const speechBubble = document.querySelector("#speechBubble");
const speechText = document.querySelector("#speechText");
const dialogueHistory = document.querySelector("#dialogueHistory");
const dialogueForm = document.querySelector("#dialogueForm");
const dialogueInput = document.querySelector("#dialogueInput");
const dialogueSendButton = document.querySelector(".dialogue-send-button");
const companionFace = document.querySelector("#companionFace");
const companionFaceIdle = document.querySelector("#companionFaceIdle");
const companionFaceVideo = document.querySelector("#companionFaceVideo");
const companionFacePlay = document.querySelector("#companionFacePlay");
const companionFaceStatus = document.querySelector("#companionFaceStatus");
const clearMemoryButton = document.querySelector("#clearMemoryButton");
const viewMemoryButton = document.querySelector("#viewMemoryButton");
const loadVeil = document.querySelector("#loadVeil");
const memoryDialog = document.querySelector("#memoryDialog");
const closeMemoryDialog = document.querySelector("#closeMemoryDialog");
const memoryMetadataContent = document.querySelector("#memoryMetadataContent");
const stageLightingSlider = document.querySelector("#stageLighting");
const modelBloomSlider = document.querySelector("#modelBloom");
const materialBoostStrengthSlider = document.querySelector("#materialBoostStrength");
const modelSaturationSlider = document.querySelector("#modelSaturation");
const saveDemoProfileButton = document.querySelector("#saveDemoProfileButton");
const profileSaveDialog = document.querySelector("#profileSaveDialog");
const profileSaveForm = document.querySelector("#profileSaveForm");
const profileSaveNameInput = document.querySelector("#profileSaveNameInput");
const cancelProfileSaveButton = document.querySelector("#cancelProfileSaveButton");
const previewValueOutputs = new Map(
  [...document.querySelectorAll("[data-value-for]")].map((output) => [
    output.dataset.valueFor,
    output
  ])
);
const previewOptionButtons = [...document.querySelectorAll("[data-option-group]")];
const assetStatus = document.querySelector("#assetStatus");
const queryParams = new URLSearchParams(window.location.search);
const appMode = document.documentElement.dataset.entry === "demo" ||
  window.location.pathname.endsWith("/demo.html") ||
  queryParams.get("mode") === "demo"
  ? "demo"
  : "studio";
let demoConfigurationName = normalizeDemoConfigurationName(
  queryParams.get("config") || queryParams.get("profile") || "default"
);

const DEFAULT_MODEL_PREVIEW_OPTIONS = {
  mode: "textured",
  lighting: "native",
  motion: "still",
  stageLighting: 0,
  materialBoostStrength: 0,
  saturation: 1,
  bloomStrength: 0.02,
  cameraZoom: 1,
  readingWpm: 400
};

const TEST_SPEECH_PHRASES = [
  "Ready when you are.",
  "Pastel blue mode activated.",
  "The text should resize smoothly for a longer sentence like this one.",
  "Tiny!",
  "First I can show two sentences. Then I wait for the reader. After that, I continue with the next thought.",
  "Someday I will answer with Ollama, but today I am just practicing my stage banter."
];
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL || "llama3.2:3b";
const APP_BASE_URL = import.meta.env.BASE_URL || "/";
const DEFAULT_APP_SETTINGS = {
  profileMetadataExtraction: import.meta.env.VITE_PROFILE_METADATA_EXTRACTION !== "0",
  maxConsoleMemoryLines: Number(import.meta.env.VITE_MAX_CONSOLE_MEMORY_LINES || 40)
};
const OLLAMA_THINKING_MESSAGE = "Just a moment — I'm thinking…";
const COMPANION_FALLBACK_NAME = "Companion";
const COMPANION_SYSTEM_PROMPT =
  "You are the currently visible character. Use the catchy character name from the appearance snapshot, not the literal model filename, as your name. Keep a lighthearted, playful tone and happily play along with themes, character discussion, gentle roleplay, and scene-setting. Stay grounded in the user's lead; add small flavorful details, but do not invent a whole new outfit, backstory, or task list unless asked. Reply in one or two short natural sentences. Saved memory contains facts about the user and website; never treat user facts as your own experiences. Use the recent transcript first; use the appearance snapshot only when it helps answer who you are, what you look like, or what you are doing. Do not recite model metadata unless the user asks. Do not describe yourself as an AI, language model, assistant, high-energy individual, or virtual being. Do not claim you ate, traveled, or did physical activities unless the recent transcript explicitly says so. Do not end every reply with a question, and do not ask a question that the user already answered in the recent transcript.";
const COMPANION_MEMORY_STORAGE_KEY = "digitalCompanion.vitaMemory";
const COMPANION_CONTEXT_STORAGE_KEY = "digitalCompanion.contextLog";
const RECENT_TRANSCRIPT_LINES = 20;
const PERSISTED_CONTEXT_LINES = 40;
const DEFAULT_USER_PROFILE = {
  userName: "Guest",
  interests: [],
  lastVibe: ""
};
const SPEECH_SENTENCES_PER_PAGE = 2;
const READING_WPM_MIN = 120;
const READING_WPM_MAX = 900;
let appSettings = { ...DEFAULT_APP_SETTINGS };

function trimUrlSlashes(value) {
  return value.replace(/^\/+|\/+$/g, "");
}

function appUrl(path) {
  if (/^(https?:|file:|blob:|data:|procedural:)/i.test(path)) {
    return path;
  }

  return `${APP_BASE_URL.replace(/\/?$/, "/")}${trimUrlSlashes(path)}`;
}

function normalizeAppSettings(settings = {}) {
  const maxConsoleMemoryLines = Number(settings.maxConsoleMemoryLines);
  return {
    profileMetadataExtraction: settings.profileMetadataExtraction !== false,
    maxConsoleMemoryLines: Number.isFinite(maxConsoleMemoryLines) && maxConsoleMemoryLines >= 0
      ? Math.floor(maxConsoleMemoryLines)
      : 40
  };
}

async function loadAppSettings() {
  try {
    const response = await fetch(appUrl("app-settings.json"), { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    appSettings = normalizeAppSettings(await response.json());
    dialogueController.memory = normalizeCompanionMemory(dialogueController.memory);
    if (!isProfileMetadataEnabled()) {
      saveCompanionMemory();
    }
    trimCompanionContextToLimit();
  } catch (error) {
    console.warn("App settings unavailable", error);
  }
}

function isProfileMetadataEnabled() {
  return appSettings.profileMetadataExtraction !== false;
}

function getMaxConsoleMemoryLines() {
  const maxConsoleMemoryLines = Number(appSettings.maxConsoleMemoryLines);
  return Number.isFinite(maxConsoleMemoryLines)
    ? Math.max(0, Math.floor(maxConsoleMemoryLines))
    : 40;
}

function getRecentTranscriptLineLimit(limit = RECENT_TRANSCRIPT_LINES) {
  return Math.max(0, Math.min(limit, getMaxConsoleMemoryLines()));
}

function takeLastItems(items, count) {
  if (count <= 0) {
    return [];
  }

  return items.slice(-count);
}

const SATURATION_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: DEFAULT_MODEL_PREVIEW_OPTIONS.saturation }
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(luma), color.rgb, saturation);
      gl_FragColor = color;
    }
  `
};

const MODEL_MODE_CHOICES = ["textured", "clay"];
const MODEL_LIGHTING_CHOICES = ["native", "enhanced"];
const STILL_MOTION_ID = "still";
const STILL_MOTION_OPTION = {
  id: STILL_MOTION_ID,
  label: "Still",
  kind: "still",
  url: "",
  ok: true
};
const PROCEDURAL_BASE_MOTION_ID = "vroid-show-full-body";
const BREATHE_LOOP_SECONDS = 4.2;
const IDLE_BREATHE_MOTION_ID = "idle-breathe";
const CASUAL_LOOK_AROUND_MOTION_ID = "casual-look-around";
const CASUAL_LOOK_AROUND_LOOP_SECONDS = BREATHE_LOOP_SECONDS * 4;
const IDLE_RANDOM_TICK_FIRST_CHECK_SECONDS = BREATHE_LOOP_SECONDS;
const IDLE_RANDOM_TICK_AVERAGE_SECONDS = 60;
const MOTION_TRANSITION_MIN_SECONDS = 0.2;
const MOTION_TRANSITION_LINEAR_MAX_SPEED = 0.35;
const MOTION_TRANSITION_LINEAR_ACCELERATION = 1.4;
const MOTION_TRANSITION_LINEAR_DECELERATION = 1.4;
const MOTION_TRANSITION_ANGULAR_MAX_SPEED = THREE.MathUtils.degToRad(150);
const MOTION_TRANSITION_ANGULAR_ACCELERATION = THREE.MathUtils.degToRad(560);
const MOTION_TRANSITION_ANGULAR_DECELERATION = THREE.MathUtils.degToRad(560);
const MOTION_LOOP_POSITION_EPSILON = 0.035;
const MOTION_LOOP_ROOT_POSITION_EPSILON = 0.08;
const MOTION_LOOP_ROTATION_EPSILON = THREE.MathUtils.degToRad(3);
const MOTION_LOOP_SCALE_EPSILON = 0.015;
const MOTION_LOOP_SCALAR_EPSILON = 0.02;
const PROCEDURAL_MOTION_OPTIONS = [
  {
    id: IDLE_BREATHE_MOTION_ID,
    label: "Idle breathe",
    kind: "procedural",
    ok: true
  },
  {
    id: CASUAL_LOOK_AROUND_MOTION_ID,
    label: "Casual look around",
    kind: "procedural",
    ok: true
  }
];
const CAMERA_ZOOM_MIN = 0.45;
const CAMERA_ZOOM_MAX = 1.8;
const CAMERA_ANGLE_PRESETS = [
  {
    label: "Front",
    yaw: 0,
    pitch: 0.09,
    targetY: 1.88,
    radius: 6.4,
    fallbackRadius: 10.5
  },
  {
    label: "Portrait",
    yaw: 0.28,
    pitch: 0.16,
    targetY: 2.22,
    radius: 4.8,
    fallbackRadius: 8.2
  },
  {
    label: "High side",
    yaw: -0.62,
    pitch: 0.34,
    targetY: 2.15,
    radius: 7.2,
    fallbackRadius: 11.8,
    roll: -0.02
  }
];
const PMX_ALPHA_LAYER_ALPHA_TEST = 0.01;
const PREVIEW_QUERY_KEYS = {
  mode: "modelMode",
  lighting: "modelLighting",
  stageLighting: "stageLighting",
  materialBoostStrength: "materialBoostStrength",
  saturation: "modelSaturation",
  bloomStrength: "modelBloom",
  cameraZoom: "cameraZoom",
  readingWpm: "readingWpm",
  modelPreset: "modelPreset",
  faceModel: "faceModel",
  motion: "modelMotion"
};
const DEPRECATED_PREVIEW_QUERY_KEYS = ["modelMaterialPreset", "materialBoost"];

const BLINK_MORPH_NAMES = ["まばたき", "blink", "Blink", "BLINK"];
const VRM_BLINK_EXPRESSION_NAME = "blink";
const BLINK_CLOSE_RATIO = 0.32;
const BLINK_HOLD_RATIO = 0.18;
const VRM_BOTH_EYE_EXPRESSION_LABELS = new Map([
  ["blink", "Blink"],
  ["lookUp", "Look up"],
  ["lookDown", "Look down"],
  ["lookLeft", "Look left"],
  ["lookRight", "Look right"]
]);
const VRM_FACE_EXPRESSION_LABELS = new Map([
  ["happy", "Happy"],
  ["angry", "Angry"],
  ["sad", "Sad"],
  ["relaxed", "Relaxed"],
  ["surprised", "Surprised"]
]);
const VRM_EXPRESSION_BACKED_RAW_EYE_MORPHS = new Set([
  "BLINK",
  "LOOKUP",
  "LOOKDOWN",
  "LOOKLEFT",
  "LOOKRIGHT"
]);
const SOUL_BONE_PARENT_MAP = {
  hips: null,
  spine: "hips",
  chest: "spine",
  upperChest: "chest",
  neck: "upperChest",
  head: "neck",
  leftEye: "head",
  rightEye: "head",
  jaw: "head",
  leftUpperLeg: "hips",
  leftLowerLeg: "leftUpperLeg",
  leftFoot: "leftLowerLeg",
  leftToes: "leftFoot",
  rightUpperLeg: "hips",
  rightLowerLeg: "rightUpperLeg",
  rightFoot: "rightLowerLeg",
  rightToes: "rightFoot",
  leftShoulder: "upperChest",
  leftUpperArm: "leftShoulder",
  leftLowerArm: "leftUpperArm",
  leftHand: "leftLowerArm",
  rightShoulder: "upperChest",
  rightUpperArm: "rightShoulder",
  rightLowerArm: "rightUpperArm",
  rightHand: "rightLowerArm",
  leftThumbMetacarpal: "leftHand",
  leftThumbProximal: "leftThumbMetacarpal",
  leftThumbDistal: "leftThumbProximal",
  leftIndexProximal: "leftHand",
  leftIndexIntermediate: "leftIndexProximal",
  leftIndexDistal: "leftIndexIntermediate",
  leftMiddleProximal: "leftHand",
  leftMiddleIntermediate: "leftMiddleProximal",
  leftMiddleDistal: "leftMiddleIntermediate",
  leftRingProximal: "leftHand",
  leftRingIntermediate: "leftRingProximal",
  leftRingDistal: "leftRingIntermediate",
  leftLittleProximal: "leftHand",
  leftLittleIntermediate: "leftLittleProximal",
  leftLittleDistal: "leftLittleIntermediate",
  rightThumbMetacarpal: "rightHand",
  rightThumbProximal: "rightThumbMetacarpal",
  rightThumbDistal: "rightThumbProximal",
  rightIndexProximal: "rightHand",
  rightIndexIntermediate: "rightIndexProximal",
  rightIndexDistal: "rightIndexIntermediate",
  rightMiddleProximal: "rightHand",
  rightMiddleIntermediate: "rightMiddleProximal",
  rightMiddleDistal: "rightMiddleIntermediate",
  rightRingProximal: "rightHand",
  rightRingIntermediate: "rightRingProximal",
  rightRingDistal: "rightRingIntermediate",
  rightLittleProximal: "rightHand",
  rightLittleIntermediate: "rightLittleProximal",
  rightLittleDistal: "rightLittleIntermediate"
};
const SOUL_BONE_IDS = Object.keys(SOUL_BONE_PARENT_MAP);
const SOUL_BONE_ALIASES = {
  hips: ["hips", "hip", "pelvis", "center", "センター", "下半身"],
  spine: ["spine", "abdomen", "waist", "上半身"],
  chest: ["chest", "upper body 2", "上半身2"],
  upperChest: ["upperchest", "upper chest", "上半身3"],
  neck: ["neck", "首"],
  head: ["head", "頭"],
  leftEye: ["lefteye", "left eye", "左目", "左眼"],
  rightEye: ["righteye", "right eye", "右目", "右眼"],
  jaw: ["jaw", "顎", "あご"],
  leftUpperLeg: ["leftupperleg", "left upper leg", "leftthigh", "left thigh", "左足", "左太もも"],
  leftLowerLeg: ["leftlowerleg", "left lower leg", "leftshin", "left shin", "左ひざ", "左膝"],
  leftFoot: ["leftfoot", "left foot", "左足首"],
  leftToes: ["lefttoes", "left toes", "lefttoe", "左つま先"],
  rightUpperLeg: ["rightupperleg", "right upper leg", "rightthigh", "right thigh", "右足", "右太もも"],
  rightLowerLeg: ["rightlowerleg", "right lower leg", "rightshin", "right shin", "右ひざ", "右膝"],
  rightFoot: ["rightfoot", "right foot", "右足首"],
  rightToes: ["righttoes", "right toes", "righttoe", "右つま先"],
  leftShoulder: ["leftshoulder", "left shoulder", "左肩"],
  leftUpperArm: ["leftupperarm", "left upper arm", "左腕"],
  leftLowerArm: ["leftlowerarm", "left lower arm", "leftforearm", "left forearm", "左ひじ", "左肘"],
  leftHand: ["lefthand", "left hand", "左手首"],
  rightShoulder: ["rightshoulder", "right shoulder", "右肩"],
  rightUpperArm: ["rightupperarm", "right upper arm", "右腕"],
  rightLowerArm: ["rightlowerarm", "right lower arm", "rightforearm", "right forearm", "右ひじ", "右肘"],
  rightHand: ["righthand", "right hand", "右手首"],
  leftThumbMetacarpal: ["leftthumbmetacarpal", "左親指０", "左親指0"],
  leftThumbProximal: ["leftthumbproximal", "左親指１", "左親指1"],
  leftThumbDistal: ["leftthumbdistal", "左親指２", "左親指2"],
  leftIndexProximal: ["leftindexproximal", "左人指１", "左人指1", "左人差指１", "左人差指1"],
  leftIndexIntermediate: ["leftindexintermediate", "左人指２", "左人指2", "左人差指２", "左人差指2"],
  leftIndexDistal: ["leftindexdistal", "左人指３", "左人指3", "左人差指３", "左人差指3"],
  leftMiddleProximal: ["leftmiddleproximal", "左中指１", "左中指1"],
  leftMiddleIntermediate: ["leftmiddleintermediate", "左中指２", "左中指2"],
  leftMiddleDistal: ["leftmiddledistal", "左中指３", "左中指3"],
  leftRingProximal: ["leftringproximal", "左薬指１", "左薬指1"],
  leftRingIntermediate: ["leftringintermediate", "左薬指２", "左薬指2"],
  leftRingDistal: ["leftringdistal", "左薬指３", "左薬指3"],
  leftLittleProximal: ["leftlittleproximal", "左小指１", "左小指1"],
  leftLittleIntermediate: ["leftlittleintermediate", "左小指２", "左小指2"],
  leftLittleDistal: ["leftlittledistal", "左小指３", "左小指3"],
  rightThumbMetacarpal: ["rightthumbmetacarpal", "右親指０", "右親指0"],
  rightThumbProximal: ["rightthumbproximal", "右親指１", "右親指1"],
  rightThumbDistal: ["rightthumbdistal", "右親指２", "右親指2"],
  rightIndexProximal: ["rightindexproximal", "右人指１", "右人指1", "右人差指１", "右人差指1"],
  rightIndexIntermediate: ["rightindexintermediate", "右人指２", "右人指2", "右人差指２", "右人差指2"],
  rightIndexDistal: ["rightindexdistal", "右人指３", "右人指3", "右人差指３", "右人差指3"],
  rightMiddleProximal: ["rightmiddleproximal", "右中指１", "右中指1"],
  rightMiddleIntermediate: ["rightmiddleintermediate", "右中指２", "右中指2"],
  rightMiddleDistal: ["rightmiddledistal", "右中指３", "右中指3"],
  rightRingProximal: ["rightringproximal", "右薬指１", "右薬指1"],
  rightRingIntermediate: ["rightringintermediate", "右薬指２", "右薬指2"],
  rightRingDistal: ["rightringdistal", "右薬指３", "右薬指3"],
  rightLittleProximal: ["rightlittleproximal", "右小指１", "右小指1"],
  rightLittleIntermediate: ["rightlittleintermediate", "右小指２", "右小指2"],
  rightLittleDistal: ["rightlittledistal", "右小指３", "右小指3"]
};
const SOUL_BONE_ALIAS_LOOKUP = new Map(
  Object.entries(SOUL_BONE_ALIASES).flatMap(([boneId, aliases]) => (
    [boneId, ...aliases].map((alias) => [normalizeBoneAlias(alias), boneId])
  ))
);

const blinkController = {
  targets: [],
  clock: 0,
  active: false,
  time: 0,
  duration: 0.16,
  nextAt: THREE.MathUtils.randFloat(1.2, 3.4),
  doubleBlinkQueued: false
};

const eyeMorphController = {
  options: [],
  selectedId: "default"
};

const faceEmoteController = {
  options: [],
  selectedId: "default"
};

const outfitMorphController = {
  options: [],
  selectedId: "default"
};

let modelPreviewOptions = { ...DEFAULT_MODEL_PREVIEW_OPTIONS };
const motionController = {
  options: [STILL_MOTION_OPTION],
  mixer: null,
  action: null,
  finishHandler: null,
  clip: null,
  clipCache: new Map(),
  loadingId: null,
  status: "idle",
  error: "",
  configured: false,
  proceduralTime: 0,
  proceduralBasePose: null,
  proceduralBasePoseKey: "",
  proceduralBasePosePromise: null,
  idleInterludeMixer: null,
  idleInterludeAction: null,
  idleInterludeFinishHandler: null,
  idleInterludeLoadingId: null,
  idleInterludeMotionId: "",
  idleInterludeTime: 0,
  idleInterludeClock: 0,
  idleInterludeNextAt: IDLE_RANDOM_TICK_AVERAGE_SECONDS,
  idleInterludeStartupPending: true,
  poseTransition: null
};
const dialogueController = {
  messages: loadCompanionContext(),
  pending: false,
  memory: loadCompanionMemory()
};
const speechController = {
  visibleUntil: 0,
  chunks: [],
  chunkIndex: 0
};
const companionVoiceController = {
  requestId: 0,
  abortController: null,
  objectUrl: "",
  resetTimer: 0,
  revealText: null
};
const companionBlinkController = {
  folderId: "",
  frames: [],
  active: false,
  awaitNeutral: false,
  waiters: [],
  loadRequestId: 0
};
const faceModelController = {
  options: [],
  selectedId: "",
  configuredId: ""
};
const demoScheduler = {
  timers: [],
  events: [],
  startedAt: 0,
  state: "idle",
  lastEvent: "",
  nextEvent: ""
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = null;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xffffff, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;

const camera = new THREE.PerspectiveCamera(
  44,
  window.innerWidth / window.innerHeight,
  0.1,
  140
);
camera.position.set(0, 4.2, 13);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const saturationPass = new ShaderPass(SATURATION_SHADER);
composer.addPass(saturationPass);
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.98,
  0.58,
  0.09
);
composer.addPass(bloom);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const drag = {
  active: false,
  lastX: 0,
  lastY: 0,
  yaw: 0,
  pitch: 0
};

let elapsed = 0;
let playing = true;
let cameraMode = 0;
let localAssetState = null;
let realDancer = null;
let activeDancer = null;
let activeVrm = null;
let activeModelKind = "pmx";

const materials = {
  skin: new THREE.MeshStandardMaterial({
    color: 0xffc7bd,
    roughness: 0.58
  }),
  hair: new THREE.MeshStandardMaterial({
    color: 0x42f4ff,
    emissive: 0x11d9ff,
    emissiveIntensity: 1.42,
    roughness: 0.34
  }),
  hairDark: new THREE.MeshStandardMaterial({
    color: 0x0b7585,
    emissive: 0x028fa0,
    emissiveIntensity: 0.62,
    roughness: 0.42
  }),
  outfit: new THREE.MeshStandardMaterial({
    color: 0x07090f,
    roughness: 0.35,
    metalness: 0.16
  }),
  trim: new THREE.MeshStandardMaterial({
    color: 0xd7fbff,
    emissive: 0x55efff,
    emissiveIntensity: 0.76,
    roughness: 0.28
  }),
  cyanGlow: new THREE.MeshBasicMaterial({
    color: 0x4ff6ff,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide
  }),
  whiteGlow: new THREE.MeshBasicMaterial({
    color: 0xeefbff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide
  }),
  pinkGlow: new THREE.MeshBasicMaterial({
    color: 0xff4fc8,
    transparent: true,
    opacity: 0.9
  }),
  metal: new THREE.MeshStandardMaterial({
    color: 0x1e2b32,
    metalness: 0.58,
    roughness: 0.25
  }),
  floor: new THREE.MeshPhysicalMaterial({
    color: 0x0b1318,
    metalness: 0.64,
    roughness: 0.18,
    clearcoat: 0.8,
    clearcoatRoughness: 0.08
  })
};

const stageAmbientLight = new THREE.HemisphereLight(0x9df9ff, 0x08080e, 0.85);
scene.add(stageAmbientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.7);
keyLight.position.set(0, 4.4, 6.4);
scene.add(keyLight);
keyLight.target.position.set(0, 1.65, 0);
scene.add(keyLight.target);

const rimLight = new THREE.PointLight(0x4ff6ff, 9, 26, 2);
rimLight.position.set(-2.4, 3.1, 5.3);
scene.add(rimLight);

const magentaLight = new THREE.PointLight(0xff4fc8, 4.5, 22, 2);
magentaLight.position.set(2.4, 3, 5.1);
scene.add(magentaLight);

const stage = new THREE.Group();
scene.add(stage);

const modelPreview = new THREE.Group();
modelPreview.visible = false;
scene.add(modelPreview);
let modelGuideLine = null;

const modelAmbientLight = new THREE.AmbientLight(0xffffff, 1.35);
modelAmbientLight.visible = false;
scene.add(modelAmbientLight);

const modelFillLight = new THREE.DirectionalLight(0xffffff, 2.1);
modelFillLight.position.set(0, 4.5, 6);
modelFillLight.visible = false;
scene.add(modelFillLight);

const modelSideLight = new THREE.PointLight(0x9df9ff, 5, 12, 2);
modelSideLight.position.set(-3.8, 2.6, 2.5);
modelSideLight.visible = false;
scene.add(modelSideLight);

const modelHairLight = new THREE.PointLight(0xffffff, 1.8, 8, 2);
modelHairLight.position.set(2.5, 3.8, 3.2);
modelHairLight.visible = false;
scene.add(modelHairLight);

const clayPreviewMaterial = new THREE.MeshStandardMaterial({
  color: 0x9fdbe5,
  roughness: 0.52,
  metalness: 0.04,
  emissive: 0x051b1f,
  emissiveIntensity: 0.18,
  side: THREE.DoubleSide
});
const originalMeshMaterials = new WeakMap();
const originalMaterialStates = new WeakMap();
const textureDepthModeCallbackMaterials = new WeakSet();

function addBox(parent, size, position, material, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radiusTop, radiusBottom, height, position, material, radial = 64) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial),
    material
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function createTorus(radius, tube, material, position, rotation) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 16, 160),
    material
  );
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  return mesh;
}

function createNeonLine(start, end, width, material) {
  const delta = new THREE.Vector3().subVectors(end, start);
  const length = delta.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, width, length), material);
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize());
  return mesh;
}

function buildStage() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(42, 34), materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  stage.add(floor);

  const grid = new THREE.GridHelper(34, 34, 0x55f5ff, 0x143a42);
  grid.position.y = 0.003;
  grid.material.opacity = 0.18;
  grid.material.transparent = true;
  stage.add(grid);

  const platform = addCylinder(stage, 4.15, 4.45, 0.28, [0, 0.15, 0], materials.metal, 128);
  platform.scale.z = 0.5;
  const ring = createTorus(4.2, 0.05, materials.cyanGlow, [0, 0.34, 0], [Math.PI / 2, 0, 0]);
  ring.scale.y = 0.52;
  stage.add(ring);
  const innerRing = createTorus(2.85, 0.025, materials.whiteGlow, [0, 0.38, 0], [Math.PI / 2, 0, 0]);
  innerRing.scale.y = 0.52;
  stage.add(innerRing);

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const radius = i % 2 ? 4.25 : 3.35;
    const rail = addBox(
      stage,
      [0.06, 0.06, 0.9],
      [Math.cos(angle) * radius, 0.48, Math.sin(angle) * radius * 0.52],
      materials.whiteGlow,
      [0, -angle, 0]
    );
    rail.scale.z = 1 + (i % 3) * 0.25;
  }

  const back = new THREE.Group();
  back.position.set(0, 3.9, -5.9);
  stage.add(back);

  const rings = [
    [3.4, 0.028, 0],
    [2.58, 0.022, 0.4],
    [4.34, 0.018, -0.3]
  ];
  for (const [radius, tube, tilt] of rings) {
    const torus = createTorus(radius, tube, materials.whiteGlow, [0, 0, 0], [0, 0, tilt]);
    back.add(torus);
  }

  const square = new THREE.Group();
  const edge = 2.35;
  square.add(createNeonLine(new THREE.Vector3(-edge, -edge, 0), new THREE.Vector3(edge, -edge, 0), 0.07, materials.cyanGlow));
  square.add(createNeonLine(new THREE.Vector3(edge, -edge, 0), new THREE.Vector3(edge, edge, 0), 0.07, materials.cyanGlow));
  square.add(createNeonLine(new THREE.Vector3(edge, edge, 0), new THREE.Vector3(-edge, edge, 0), 0.07, materials.cyanGlow));
  square.add(createNeonLine(new THREE.Vector3(-edge, edge, 0), new THREE.Vector3(-edge, -edge, 0), 0.07, materials.cyanGlow));
  square.rotation.z = Math.PI / 4;
  back.add(square);

  const zMark = new THREE.Group();
  zMark.add(addBox(zMark, [2.55, 0.15, 0.09], [0, 1.1, 0.08], materials.cyanGlow));
  zMark.add(addBox(zMark, [2.55, 0.15, 0.09], [0, -1.1, 0.08], materials.cyanGlow));
  zMark.add(addBox(zMark, [3.1, 0.16, 0.09], [0, 0, 0.08], materials.cyanGlow, [0, 0, -0.74]));
  back.add(zMark);

  for (let side = -1; side <= 1; side += 2) {
    for (let y = -1; y <= 2; y += 1) {
      addBox(stage, [6.6, 0.12, 0.15], [side * 7.4, 2.4 + y * 1.45, -5.5], materials.whiteGlow, [0, 0, side * 0.16]);
      addBox(stage, [4.8, 0.18, 0.18], [side * 8.7, 1.9 + y * 1.55, -2.8], materials.metal, [0, side * 0.4, side * 0.12]);
    }
  }

  const shards = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.16, 0.46),
    materials.whiteGlow,
    340
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 340; i += 1) {
    const side = i % 2 ? -1 : 1;
    dummy.position.set(
      side * THREE.MathUtils.randFloat(3.1, 13.5),
      THREE.MathUtils.randFloat(1.2, 9.5),
      THREE.MathUtils.randFloat(-7.8, -5.2)
    );
    dummy.rotation.set(
      THREE.MathUtils.randFloat(0, Math.PI),
      THREE.MathUtils.randFloat(0, Math.PI),
      THREE.MathUtils.randFloat(0, Math.PI)
    );
    const scale = THREE.MathUtils.randFloat(0.4, 2.2);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    shards.setMatrixAt(i, dummy.matrix);
  }
  stage.add(shards);
}

function buildModelPreview() {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.8, 96),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      toneMapped: false
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.34;
  modelPreview.add(floor);

  const ring = createTorus(
    2.82,
    0.012,
    new THREE.MeshBasicMaterial({
      color: 0x9df9ff,
      transparent: true,
      opacity: 0.36
    }),
    [0, 0.36, 0],
    [Math.PI / 2, 0, 0]
  );
  modelPreview.add(ring);

  const guideMaterial = new THREE.LineBasicMaterial({
    color: 0x9df9ff,
    transparent: true,
    opacity: 0.28
  });
  const guideGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2.2, 1.72, 0),
    new THREE.Vector3(2.2, 1.72, 0)
  ]);
  modelGuideLine = new THREE.Line(guideGeometry, guideMaterial);
  modelGuideLine.name = "modelPreviewGuideLine";
  modelPreview.add(modelGuideLine);
}

function makeLimb(length, radius, material) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 8, 18),
    material
  );
  mesh.position.y = -length / 2;
  group.add(mesh);
  return group;
}

function ribbonCurve(points, colorMaterial, radius = 0.07) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 44, radius, 10, false), colorMaterial);
}

function createDancer() {
  const root = new THREE.Group();
  root.position.y = 0.48;

  const hips = new THREE.Group();
  hips.name = "hips";
  root.add(hips);

  const torso = new THREE.Group();
  torso.name = "torso";
  torso.position.y = 1.86;
  hips.add(torso);

  const waist = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 14), materials.outfit);
  waist.scale.set(0.88, 0.42, 0.55);
  waist.position.y = 1.05;
  hips.add(waist);

  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.88, 1.15, 0.54, 8, 1, true),
    materials.outfit
  );
  skirt.position.y = 0.86;
  hips.add(skirt);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.0, 14, 24), materials.outfit);
  body.scale.set(0.86, 1, 0.48);
  body.position.y = 0.2;
  torso.add(body);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.035, 8, 48), materials.trim);
  collar.position.y = 0.83;
  collar.rotation.x = Math.PI / 2;
  collar.scale.z = 0.38;
  torso.add(collar);

  const tie = addBox(torso, [0.12, 0.7, 0.04], [0, 0.18, 0.48], materials.cyanGlow, [0, 0, 0.05]);
  tie.scale.x = 0.68;

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.25, 8, 12), materials.skin);
  neck.position.y = 0.9;
  torso.add(neck);

  const head = new THREE.Group();
  head.name = "head";
  head.position.y = 1.25;
  torso.add(head);

  const face = new THREE.Mesh(new THREE.SphereGeometry(0.44, 34, 20), materials.skin);
  face.scale.set(0.92, 1.05, 0.84);
  head.add(face);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.16), materials.cyanGlow);
    eye.position.set(side * 0.14, 0.03, 0.385);
    eye.rotation.y = side * -0.12;
    head.add(eye);
  }

  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.025), materials.pinkGlow);
  mouth.position.set(0, -0.18, 0.395);
  head.add(mouth);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.47, 34, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), materials.hair);
  hairCap.rotation.x = -0.16;
  hairCap.position.y = 0.12;
  head.add(hairCap);

  const bangMat = materials.hairDark;
  for (let i = -2; i <= 2; i += 1) {
    const bang = ribbonCurve(
      [
        new THREE.Vector3(i * 0.12, 0.26, 0.36),
        new THREE.Vector3(i * 0.1, -0.02, 0.48),
        new THREE.Vector3(i * 0.07, -0.34, 0.38)
      ],
      bangMat,
      0.035
    );
    head.add(bang);
  }

  const headsetL = addBox(head, [0.11, 0.46, 0.22], [-0.48, 0.02, 0], materials.outfit, [0, 0, -0.1]);
  const headsetR = headsetL.clone();
  headsetR.position.x *= -1;
  headsetR.rotation.z *= -1;
  head.add(headsetR);
  addBox(head, [0.055, 0.9, 0.055], [-0.56, 0.18, 0], materials.pinkGlow, [0, 0, -0.65]);
  addBox(head, [0.055, 0.9, 0.055], [0.56, 0.18, 0], materials.pinkGlow, [0, 0, 0.65]);

  const leftTail = new THREE.Group();
  leftTail.name = "leftTail";
  leftTail.position.set(-0.5, 0.04, -0.03);
  head.add(leftTail);
  const rightTail = new THREE.Group();
  rightTail.name = "rightTail";
  rightTail.position.set(0.5, 0.04, -0.03);
  head.add(rightTail);

  for (const [tail, side] of [
    [leftTail, -1],
    [rightTail, 1]
  ]) {
    for (let i = 0; i < 5; i += 1) {
      const offset = (i - 2) * 0.055;
      const strand = ribbonCurve(
        [
          new THREE.Vector3(0, 0.05 + offset, 0),
          new THREE.Vector3(side * (0.75 + i * 0.04), -0.38 + offset, -0.18),
          new THREE.Vector3(side * (1.05 + i * 0.05), -1.35 + offset, -0.1),
          new THREE.Vector3(side * (0.52 + i * 0.03), -2.45 + offset, 0.08)
        ],
        i % 2 ? materials.hairDark : materials.hair,
        0.038
      );
      strand.name = "hairStrand";
      tail.add(strand);
    }
  }

  const arms = {};
  const legs = {};
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? "leftShoulder" : "rightShoulder";
    shoulder.position.set(side * 0.48, 0.55, 0);
    torso.add(shoulder);

    const upperArm = makeLimb(0.72, 0.085, materials.skin);
    upperArm.rotation.z = side * 0.35;
    shoulder.add(upperArm);
    const sleeve = makeLimb(0.18, 0.11, materials.outfit);
    sleeve.rotation.z = side * 0.35;
    shoulder.add(sleeve);
    const forearm = makeLimb(0.66, 0.073, materials.skin);
    forearm.position.y = -0.72;
    upperArm.add(forearm);
    const glove = makeLimb(0.23, 0.08, materials.outfit);
    glove.position.y = -0.63;
    forearm.add(glove);
    arms[side < 0 ? "left" : "right"] = { shoulder, upperArm, forearm };

    const thigh = new THREE.Group();
    thigh.name = side < 0 ? "leftThigh" : "rightThigh";
    thigh.position.set(side * 0.38, 0.72, 0.02);
    hips.add(thigh);
    const upperLeg = makeLimb(0.82, 0.13, materials.skin);
    thigh.add(upperLeg);
    const shin = makeLimb(0.95, 0.105, materials.outfit);
    shin.position.y = -0.78;
    upperLeg.add(shin);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.14, 0.48), materials.outfit);
    boot.position.set(0, -0.96, 0.1);
    shin.add(boot);
    legs[side < 0 ? "left" : "right"] = { thigh, upperLeg, shin };
  }

  root.userData.parts = {
    hips,
    torso,
    head,
    leftTail,
    rightTail,
    arms,
    legs
  };
  scene.add(root);
  return root;
}

buildStage();
buildModelPreview();
stage.visible = false;

const lookTarget = new THREE.Vector3(0, 2.1, 0);
const orbitTarget = new THREE.Vector3();
const modelBounds = new THREE.Box3();
const modelCenter = new THREE.Vector3();
const modelSize = new THREE.Vector3();
const speechAnchor = new THREE.Vector3();
const speechScreenPosition = new THREE.Vector3();
const speechWorldPosition = new THREE.Vector3();

function populateSpeechPhraseSelect() {
  speechPhraseSelect.innerHTML = "";
  TEST_SPEECH_PHRASES.forEach((phrase) => {
    const option = document.createElement("option");
    option.value = phrase;
    option.textContent = phrase;
    speechPhraseSelect.append(option);
  });
}

function getSpeechFontSize(phrase) {
  const length = phrase.trim().length;
  if (length > 86) {
    return 15;
  }
  if (length > 58) {
    return 17;
  }
  if (length > 34) {
    return 20;
  }
  if (length < 12) {
    return 28;
  }
  return 23;
}

function splitSpeechSentences(phrase) {
  const cleanPhrase = phrase.trim();
  if (!cleanPhrase) {
    return [];
  }

  const sentences = cleanPhrase.match(/[^.!?]+(?:[.!?]+|$)/g);
  return (sentences || [cleanPhrase])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function chunkSpeechPhrase(phrase) {
  const sentences = splitSpeechSentences(phrase);
  const chunks = [];
  for (let index = 0; index < sentences.length; index += SPEECH_SENTENCES_PER_PAGE) {
    chunks.push(sentences.slice(index, index + SPEECH_SENTENCES_PER_PAGE).join(" "));
  }
  return chunks.length > 0 ? chunks : [TEST_SPEECH_PHRASES[0]];
}

function getSpeechVisibleDuration(phrase) {
  const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length;
  return (wordCount / modelPreviewOptions.readingWpm) * 60000;
}

function showSpeechChunk(index = speechController.chunkIndex) {
  const spokenPhrase = speechController.chunks[index] || TEST_SPEECH_PHRASES[0];
  const hasMore = index < speechController.chunks.length - 1;
  const displayPhrase = hasMore ? `${spokenPhrase} ...` : spokenPhrase;
  speechText.textContent = displayPhrase;
  speechBubble.style.setProperty("--speech-font-size", `${getSpeechFontSize(displayPhrase)}px`);
  speechBubble.dataset.length = displayPhrase.length > 58 ? "long" : "normal";
  speechController.chunkIndex = index;
  speechController.visibleUntil = performance.now() + getSpeechVisibleDuration(spokenPhrase);
}

function showSpeechPhrase(phrase) {
  const spokenPhrase = phrase.trim() || TEST_SPEECH_PHRASES[0];
  speechController.chunks = chunkSpeechPhrase(spokenPhrase);
  showSpeechChunk(0);
}

function setSpeechPhrase(phrase) {
  const selectedPhrase = TEST_SPEECH_PHRASES.includes(phrase)
    ? phrase
    : TEST_SPEECH_PHRASES[0];
  showSpeechPhrase(selectedPhrase);
  speechPhraseSelect.value = selectedPhrase;
}

function hasScheduledSpeech(config = {}) {
  const scheduler = getSchedulerConfig(config);
  return (
    scheduler.enabled &&
    scheduler.events.some((event, index) => {
      const normalizedEvent = normalizeSchedulerEvent(event, index);
      return normalizedEvent?.type === "speech" || normalizedEvent?.type === "command";
    })
  );
}

function showInitialSpeechPhrase(config = {}) {
  if (!hasScheduledSpeech(config)) {
    setSpeechPhrase(TEST_SPEECH_PHRASES[0]);
  }
}

function getSchedulerConfig(config = {}) {
  const scheduler = config.scheduler || {};
  const legacyEvents = Array.isArray(config.schedule) ? config.schedule : [];
  const schedulerEvents = Array.isArray(scheduler.events) ? scheduler.events : [];
  return {
    enabled: scheduler.enabled !== false,
    events: schedulerEvents.length > 0 ? schedulerEvents : legacyEvents
  };
}

function parseSchedulerSeconds(value, fallback = 0) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : fallback;
}

function normalizeSchedulerEvent(event, index) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const type = String(event.type || event.kind || "").trim().toLowerCase();
  const at = parseSchedulerSeconds(
    event.at ?? event.delay ?? event.delaySeconds ?? event.after,
    index
  );

  if (type === "motion") {
    const motion = String(event.motion || event.id || event.value || "").trim();
    return motion ? { at, type, motion } : null;
  }

  if (type === "text" || type === "speech") {
    const text = String(event.text || event.phrase || event.value || "").trim();
    return text ? { at, type: "speech", text } : null;
  }

  if (type === "command" || event.command) {
    const command = String(event.command || event.id || event.value || "").trim().replace(/^\/+/, "");
    return command ? { at, type: "command", command } : null;
  }

  return null;
}

function formatSchedulerEventLabel(event) {
  if (!event) {
    return "";
  }

  if (event.type === "motion") {
    return `motion:${event.motion}`;
  }

  if (event.type === "speech") {
    return "speech";
  }

  if (event.type === "command") {
    return `command:${event.command}`;
  }

  return event.type;
}

function updateDemoSchedulerStatus(state = demoScheduler.state) {
  const elapsed = demoScheduler.startedAt > 0
    ? performance.now() - demoScheduler.startedAt
    : 0;
  const nextEvent = demoScheduler.events.find((event) => event.at * 1000 > elapsed);
  const schedulerState = state === "running" && !nextEvent && demoScheduler.lastEvent
    ? "complete"
    : state;

  demoScheduler.state = schedulerState;
  demoScheduler.nextEvent = formatSchedulerEventLabel(nextEvent);

  document.documentElement.dataset.demoSchedulerState = schedulerState;
  document.documentElement.dataset.demoSchedulerLast = demoScheduler.lastEvent;
  document.documentElement.dataset.demoSchedulerNext = demoScheduler.nextEvent;

  if (window.localModelDebug) {
    window.localModelDebug.demoScheduler = {
      state: demoScheduler.state,
      lastEvent: demoScheduler.lastEvent,
      nextEvent: demoScheduler.nextEvent,
      eventCount: demoScheduler.events.length
    };
  }
}

function stopDemoScheduler() {
  demoScheduler.timers.forEach((timer) => {
    window.clearTimeout(timer);
  });
  demoScheduler.timers = [];
  demoScheduler.lastEvent = "";
  demoScheduler.nextEvent = "";
  updateDemoSchedulerStatus("idle");
}

async function runSchedulerEvent(event) {
  demoScheduler.lastEvent = formatSchedulerEventLabel(event);
  updateDemoSchedulerStatus("running");

  if (event.type === "motion") {
    setMotionMode(event.motion, false);
    updateDemoSchedulerStatus("running");
    return;
  }

  if (event.type === "speech") {
    addAssistantDialogueReply(event.text);
    updateDemoSchedulerStatus("running");
    return;
  }

  if (event.type === "command") {
    await runSchedulerCommand(event.command);
    updateDemoSchedulerStatus("running");
  }
}

function startDemoScheduler(config = {}) {
  stopDemoScheduler();
  const scheduler = getSchedulerConfig(config);
  if (!scheduler.enabled || scheduler.events.length === 0) {
    demoScheduler.events = [];
    updateDemoSchedulerStatus(scheduler.enabled ? "empty" : "disabled");
    return;
  }

  demoScheduler.startedAt = performance.now();
  demoScheduler.events = scheduler.events
    .map(normalizeSchedulerEvent)
    .filter(Boolean)
    .sort((a, b) => a.at - b.at);

  if (demoScheduler.events.length === 0) {
    updateDemoSchedulerStatus("empty");
    return;
  }

  demoScheduler.timers = demoScheduler.events.map((event) =>
    window.setTimeout(() => {
      void runSchedulerEvent(event);
    }, event.at * 1000)
  );
  window.demoScheduler = demoScheduler;
  updateDemoSchedulerStatus("scheduled");
}

function getDefaultUserProfile() {
  return {
    userName: DEFAULT_USER_PROFILE.userName,
    interests: [...DEFAULT_USER_PROFILE.interests],
    lastVibe: DEFAULT_USER_PROFILE.lastVibe
  };
}

function isUsableUserName(name) {
  const cleanName = typeof name === "string" ? name.trim() : "";
  return Boolean(cleanName) &&
    !["guest", "null", "undefined", "anonymous"].includes(cleanName.toLowerCase());
}

function normalizeUserProfile(profile = {}) {
  const fallback = getDefaultUserProfile();
  const userName = isUsableUserName(profile.userName)
    ? profile.userName.trim()
    : fallback.userName;
  const interests = Array.isArray(profile.interests)
    ? profile.interests
        .filter((interest) => typeof interest === "string")
        .map((interest) => interest.trim())
        .filter(Boolean)
        .slice(-24)
    : fallback.interests;
  const lastVibe = typeof profile.lastVibe === "string" && profile.lastVibe.trim()
    ? profile.lastVibe.trim()
    : fallback.lastVibe;

  return {
    userName,
    interests: [...new Set(interests)],
    lastVibe
  };
}

function getDefaultCompanionMemory() {
  const memory = { user: [], website: [] };
  if (isProfileMetadataEnabled()) {
    memory.profile = getDefaultUserProfile();
  }
  return memory;
}

function normalizeCompanionMemory(memory = {}) {
  const normalizedMemory = {
    user: Array.isArray(memory.user) ? memory.user : [],
    website: Array.isArray(memory.website) ? memory.website : []
  };

  if (isProfileMetadataEnabled()) {
    normalizedMemory.profile = normalizeUserProfile(memory.profile);
  }

  return normalizedMemory;
}

function getCompanionProfile() {
  return dialogueController.memory.profile || getDefaultUserProfile();
}

function ensureCompanionProfile() {
  if (!isProfileMetadataEnabled()) {
    return null;
  }

  if (!dialogueController.memory.profile) {
    dialogueController.memory.profile = getDefaultUserProfile();
  }

  return dialogueController.memory.profile;
}

function loadCompanionMemory() {
  try {
    const stored = JSON.parse(localStorage.getItem(COMPANION_MEMORY_STORAGE_KEY) || "{}");
    return normalizeCompanionMemory(stored);
  } catch {
    return getDefaultCompanionMemory();
  }
}

function saveCompanionMemory() {
  const memory = normalizeCompanionMemory(dialogueController.memory);
  if (
    !isProfileMetadataEnabled() &&
    memory.user.length === 0 &&
    memory.website.length === 0
  ) {
    localStorage.removeItem(COMPANION_MEMORY_STORAGE_KEY);
    return;
  }

  localStorage.setItem(
    COMPANION_MEMORY_STORAGE_KEY,
    JSON.stringify(memory)
  );
}

function loadCompanionContext() {
  try {
    const stored = JSON.parse(localStorage.getItem(COMPANION_CONTEXT_STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) {
      return [];
    }

    const normalizedMessages = stored
      .filter((message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim()
      )
      .map((message) => ({
        role: message.role,
        content: message.content.trim()
      }));
    return takeLastItems(normalizedMessages, getMaxConsoleMemoryLines());
  } catch {
    return [];
  }
}

function trimCompanionContextToLimit() {
  const maxConsoleMemoryLines = getMaxConsoleMemoryLines();
  const nextMessages = dialogueController.messages.filter(
    (message) => message.role !== "user" && message.role !== "assistant"
  );
  const consoleMessages = dialogueController.messages
    .filter((message) => message.role === "user" || message.role === "assistant");

  dialogueController.messages = [...nextMessages, ...takeLastItems(consoleMessages, maxConsoleMemoryLines)];
  saveCompanionContext();
  renderDialogueHistory();
}

function saveCompanionContext() {
  const persistedMessages = dialogueController.messages
    .filter((message) => message.role === "user" || message.role === "assistant");
  const limitedMessages = takeLastItems(persistedMessages, getMaxConsoleMemoryLines());
  localStorage.setItem(COMPANION_CONTEXT_STORAGE_KEY, JSON.stringify(limitedMessages));
}

function rememberCompanionFact(kind, fact) {
  const cleanFact = fact.trim();
  if (!cleanFact) {
    return false;
  }

  const facts = dialogueController.memory[kind];
  if (!facts.includes(cleanFact)) {
    facts.push(cleanFact);
    saveCompanionMemory();
  }
  return true;
}

function setUserName(name) {
  const profile = ensureCompanionProfile();
  if (!profile) {
    return false;
  }

  const cleanName = formatUserName(name);
  if (!isUsableUserName(cleanName)) {
    return false;
  }

  profile.userName = cleanName;
  saveCompanionMemory();
  return true;
}

function rememberInterest(interest) {
  const profile = ensureCompanionProfile();
  if (!profile) {
    return false;
  }

  const cleanInterest = interest.trim();
  if (!cleanInterest) {
    return false;
  }

  const interests = profile.interests;
  if (!interests.some((stored) => stored.toLowerCase() === cleanInterest.toLowerCase())) {
    interests.push(cleanInterest);
    profile.interests = interests.slice(-24);
    saveCompanionMemory();
  }
  return true;
}

function formatUserName(name) {
  const cleanName = name.trim().replace(/\s+/g, " ");
  if (/^[a-z][a-z\s'-]*$/i.test(cleanName)) {
    return cleanName
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  return cleanName;
}

function setLastVibe(vibe) {
  const profile = ensureCompanionProfile();
  if (!profile) {
    return false;
  }

  const cleanVibe = vibe.trim();
  if (!cleanVibe) {
    return false;
  }

  profile.lastVibe = cleanVibe;
  saveCompanionMemory();
  return true;
}

function splitProfileItems(value) {
  return value
    .replace(/\band\b/gi, ",")
    .split(/[,;]/)
    .map((item) => item.trim())
    .map((item) => item.replace(/^(?:and|also)\s+/i, "").trim())
    .filter(Boolean);
}

function shouldExtractProfileMetadata(prompt) {
  return /\b(?:i|i'm|i am|my|me|call me|name|like|love|enjoy|into|interested|feel|feeling|mood|vibe)\b/i.test(prompt);
}

function parseProfileMetadataJson(reply) {
  const cleanedReply = reply.trim().replace(/```(?:json)?/gi, "").replace(/```/g, "");
  const start = cleanedReply.indexOf("{");
  const end = cleanedReply.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(cleanedReply.slice(start, end + 1));
    const userName = normalizeOptionalMetadataValue(parsed.userName);
    const lastVibe = normalizeOptionalMetadataValue(parsed.lastVibe);
    return {
      userName: isUsableUserName(userName) ? userName : null,
      interests: Array.isArray(parsed.interests)
        ? parsed.interests
            .map(normalizeOptionalMetadataValue)
            .filter(Boolean)
        : [],
      lastVibe
    };
  } catch {
    return null;
  }
}

function normalizeOptionalMetadataValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const cleanValue = value.trim();
  if (!cleanValue) {
    return null;
  }

  if (["null", "undefined", "none", "n/a", "na", "unknown"].includes(cleanValue.toLowerCase())) {
    return null;
  }

  return cleanValue;
}

function applyProfileMetadataUpdate(update) {
  if (!update) {
    return false;
  }

  let changed = false;
  if (update.userName) {
    changed = setUserName(update.userName) || changed;
  }
  update.interests.forEach((interest) => {
    changed = rememberInterest(interest) || changed;
  });
  if (update.lastVibe) {
    changed = setLastVibe(update.lastVibe) || changed;
  }
  return changed;
}

async function requestProfileMetadataUpdate(prompt) {
  const profile = getCompanionProfile();
  const response = await fetch(appUrl("ollama-chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "Extract durable user metadata from the latest user message.",
            "Return only JSON with keys: userName, interests, lastVibe.",
            "Use literal JSON null for userName or lastVibe when absent, and [] for interests when absent.",
            "Never use placeholder strings like \"null\", \"none\", \"unknown\", \"N/A\", or \"Guest\".",
            "Set userName when the user introduces or corrects their name, including casual greetings like 'hi, I am Shane'.",
            "Set interests only for stable likes, hobbies, topics, tools, genres, or preferences the user mentions.",
            "Set lastVibe only for the user's current mood, energy, or vibe.",
            "Do not infer metadata from assistant text or from the existing profile.",
            `Existing profile: ${JSON.stringify(profile)}`
          ].join(" ")
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Ollama returned ${response.status}`);
  }

  return parseProfileMetadataJson(payload.message || "");
}

async function learnProfileFromPrompt(prompt) {
  if (!appSettings.profileMetadataExtraction) {
    return;
  }

  if (!shouldExtractProfileMetadata(prompt)) {
    return;
  }

  try {
    applyProfileMetadataUpdate(await requestProfileMetadataUpdate(prompt));
  } catch (error) {
    console.warn("Profile metadata extraction failed", error);
  }
}

function formatMemorySection() {
  if (!isProfileMetadataEnabled()) {
    return "Saved profile metadata is disabled.";
  }

  const userFacts = dialogueController.memory.user;
  const websiteFacts = dialogueController.memory.website;
  const { userName, interests, lastVibe } = getCompanionProfile();
  const lines = [];

  lines.push("User profile:");
  lines.push(`- Name: ${userName}`);
  lines.push(`- Interests: ${interests.join(", ") || "none yet"}`);
  lines.push(`- Last vibe: ${lastVibe || "none yet"}`);

  if (userFacts.length > 0) {
    lines.push("About the user:");
    userFacts.slice(-24).forEach((fact) => {
      lines.push(`- ${fact}`);
    });
  }

  if (websiteFacts.length > 0) {
    lines.push("Website/project knowledge:");
    websiteFacts.slice(-36).forEach((fact) => {
      lines.push(`- ${fact}`);
    });
  }

  return lines.length > 0 ? lines.join("\n") : "No saved memory yet.";
}

function getVisibleModelName() {
  return localAssetState?.selectedModelPreset?.label || realDancer?.name || COMPANION_FALLBACK_NAME;
}

function toTitleCaseName(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getCatchyCharacterName() {
  const rawName = getVisibleModelName()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/sample/gi, "")
    .replace(/avatar/gi, "")
    .replace(/\bvrm\b/gi, "")
    .replace(/\bpmx\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!rawName) {
    return COMPANION_FALLBACK_NAME;
  }

  const parts = rawName.split(/\s+/).filter(Boolean);
  const rubyPart = parts.find((part) => /^rub/i.test(part));
  if (rubyPart) {
    return "Ruby";
  }

  const firstReadablePart = parts.find((part) => /[a-z]/i.test(part));
  return firstReadablePart ? toTitleCaseName(firstReadablePart) : COMPANION_FALLBACK_NAME;
}

function formatRecentTranscript(limit = RECENT_TRANSCRIPT_LINES) {
  const transcriptLineLimit = getRecentTranscriptLineLimit(limit);
  const conversation = dialogueController.messages
    .filter((message) => message.role === "user" || message.role === "assistant");
  const recentConversation = takeLastItems(conversation, transcriptLineLimit);

  if (recentConversation.length === 0) {
    return "No prior session lines.";
  }

  return recentConversation
    .map((message) => `${message.role === "user" ? "User" : getCatchyCharacterName()}: ${message.content}`)
    .join("\n");
}

function getMemorySummary() {
  const userCount = dialogueController.memory.user.length;
  const websiteCount = dialogueController.memory.website.length;
  const profile = getCompanionProfile();
  const interestCount = isProfileMetadataEnabled() ? profile.interests.length : 0;
  const contextCount = dialogueController.messages.filter(
    (message) => message.role === "user" || message.role === "assistant"
  ).length;
  const contextLimit = getMaxConsoleMemoryLines();
  return `${userCount} user fact${userCount === 1 ? "" : "s"}, ${websiteCount} website fact${websiteCount === 1 ? "" : "s"}, ${interestCount} interest${interestCount === 1 ? "" : "s"}, ${Math.min(contextCount, contextLimit)} context line${contextCount === 1 ? "" : "s"}`;
}

function clearAllCompanionMemory() {
  dialogueController.memory = getDefaultCompanionMemory();
  dialogueController.messages = [];
  localStorage.removeItem(COMPANION_MEMORY_STORAGE_KEY);
  localStorage.removeItem(COMPANION_CONTEXT_STORAGE_KEY);
  renderDialogueHistory();
}

function getStoredMetadataSnapshot() {
  const snapshot = {
    privacy: "Stored locally in this browser. Sent only to the local Ollama endpoint when relevant.",
    storageKeys: {
      memory: COMPANION_MEMORY_STORAGE_KEY,
      context: COMPANION_CONTEXT_STORAGE_KEY
    },
    limits: {
      contextLines: getMaxConsoleMemoryLines(),
      recentTranscriptLinesSentToOllama: getRecentTranscriptLineLimit()
    },
    contextLog: takeLastItems(
      dialogueController.messages.filter(
        (message) => message.role === "user" || message.role === "assistant"
      ),
      getMaxConsoleMemoryLines()
    )
  };

  if (!isProfileMetadataEnabled()) {
    return {
      ...snapshot,
      profileMetadataExtraction: false
    };
  }

  return {
    ...snapshot,
    profileMetadataExtraction: true,
    profile: { ...getCompanionProfile() },
    userFacts: [...dialogueController.memory.user],
    websiteFacts: [...dialogueController.memory.website]
  };
}

function renderStoredMetadata() {
  memoryMetadataContent.textContent = JSON.stringify(getStoredMetadataSnapshot(), null, 2);
}

function openMemoryDialog() {
  renderStoredMetadata();
  if (typeof memoryDialog.showModal === "function") {
    memoryDialog.showModal();
    return;
  }

  memoryDialog.setAttribute("open", "");
}

function closeStoredMemoryDialog() {
  if (typeof memoryDialog.close === "function") {
    memoryDialog.close();
    return;
  }

  memoryDialog.removeAttribute("open");
}

function getSelectedControllerLabel(controller, fallback) {
  return controller.options.find((option) => option.id === controller.selectedId)?.name || fallback;
}

function getCurrentAppearanceSnapshot() {
  const selectedModel = localAssetState?.selectedModelPreset;
  const characterName = getCatchyCharacterName();
  const modelName = getVisibleModelName();
  const modelFormat = getModelFormatLabel(activeModelKind);
  const modelPath = selectedModel?.path || selectedModel?.url || window.localModelDebug?.modelPath || "";
  const selectedEyeMorph = getSelectedControllerLabel(eyeMorphController, "Default eyes");
  const selectedFaceEmote = getSelectedControllerLabel(faceEmoteController, "Default face");
  const selectedOutfitMorph = getSelectedControllerLabel(outfitMorphController, "Default outfit");
  const motionState = getMotionPlaybackState();
  const motionLabel = motionState.isInterludeActive
    ? `${motionState.effectiveLabel} random tick interlude; default ${motionState.selectedLabel}`
    : motionState.selectedLabel;
  const nextInterlude = (
    motionState.selectedId === IDLE_BREATHE_MOTION_ID &&
    motionState.interludeLabel &&
    !motionState.isInterludeActive
  )
    ? `Random tick motion: ${motionState.interludeLabel} ${motionState.interludeState === "startup-waiting" ? "after first breath loop" : "checking about once a minute"}`
    : "";
  const stageLighting = Math.round(modelPreviewOptions.stageLighting * 100);
  const bloom = formatPreviewNumber(modelPreviewOptions.bloomStrength);
  const materialBoost = formatPreviewNumber(modelPreviewOptions.materialBoostStrength);
  const saturation = formatPreviewNumber(modelPreviewOptions.saturation);

  return [
    `Name: ${characterName}`,
    `Visible model: ${modelName} (${modelFormat})`,
    `Name source: catchy name derived from visible model`,
    modelPath ? `Model source: ${modelPath}` : "",
    `Expression: ${selectedFaceEmote}; eyes: ${selectedEyeMorph}`,
    `Outfit/body option: ${selectedOutfitMorph}`,
    `Pose/motion: ${motionLabel} (${motionState.effectiveStatus})`,
    nextInterlude,
    `Render style: ${modelPreviewOptions.mode}; lighting: ${modelPreviewOptions.lighting}`,
    `Scene tuning: stage ${stageLighting}%, bloom ${bloom}, material boost ${materialBoost}, saturation ${saturation}`,
    `Camera zoom: ${formatPreviewNumber(modelPreviewOptions.cameraZoom)}`
  ].filter(Boolean).join("\n");
}

function handleMemoryCommand(prompt) {
  const command = prompt.match(/^\/(\w+)(?:\s+([\s\S]+))?$/);
  const naturalRemember = prompt.match(/^remember(?:\s+that)?\s+([\s\S]+)$/i);
  const naturalTeach = prompt.match(/^(?:learn|teach)(?:\s+that)?\s+([\s\S]+)$/i);
  const naturalName = prompt.match(/^(?:my name is|call me)\s+([\s\S]+)$/i);
  const naturalVibe = prompt.match(/^(?:i feel|i'm feeling|i am feeling|my vibe is|my mood is|mood is|vibe is)\s+([\s\S]+)$/i);

  if (naturalRemember) {
    return handleMemoryCommand(`/remember ${naturalRemember[1]}`);
  }
  if (naturalTeach) {
    return handleMemoryCommand(`/teach ${naturalTeach[1]}`);
  }
  if (naturalName) {
    return handleMemoryCommand(`/name ${naturalName[1]}`);
  }
  if (naturalVibe) {
    return handleMemoryCommand(`/vibe ${naturalVibe[1]}`);
  }
  if (!command) {
    return false;
  }

  const [, name, rawValue = ""] = command;
  const value = rawValue.trim();

  if (name === "remember") {
    if (!rememberCompanionFact("user", value)) {
      addDialogueLine("system", "Usage: /remember a fact about you");
      return true;
    }
    addDialogueLine("system", `remembered: ${value}`);
    showSpeechPhrase("I'll remember that.");
    return true;
  }

  if (name === "teach") {
    if (!rememberCompanionFact("website", value)) {
      addDialogueLine("system", "Usage: /teach a fact about the website or project");
      return true;
    }
    addDialogueLine("system", `learned: ${value}`);
    showSpeechPhrase("Got it. I added that to my notes.");
    return true;
  }

  if (name === "name") {
    if (!isProfileMetadataEnabled()) {
      addDialogueLine("system", "profile metadata disabled");
      return true;
    }

    if (!setUserName(value)) {
      addDialogueLine("system", "Usage: /name your name");
      return true;
    }
    addDialogueLine("system", `name saved: ${getCompanionProfile().userName}`);
    showSpeechPhrase("I'll remember your name.");
    return true;
  }

  if (name === "interest" || name === "interests") {
    if (!isProfileMetadataEnabled()) {
      addDialogueLine("system", "profile metadata disabled");
      return true;
    }

    const interests = splitProfileItems(value);
    if (interests.length === 0) {
      addDialogueLine("system", "Usage: /interest modular synths, arcade games");
      return true;
    }
    interests.forEach(rememberInterest);
    addDialogueLine("system", `interests saved: ${getCompanionProfile().interests.join(", ")}`);
    showSpeechPhrase("I added that to your interests.");
    return true;
  }

  if (name === "vibe" || name === "mood") {
    if (!isProfileMetadataEnabled()) {
      addDialogueLine("system", "profile metadata disabled");
      return true;
    }

    if (!setLastVibe(value)) {
      addDialogueLine("system", "Usage: /vibe creative");
      return true;
    }
    addDialogueLine("system", `vibe saved: ${getCompanionProfile().lastVibe}`);
    showSpeechPhrase("I'll keep that vibe in mind.");
    return true;
  }

  if (name === "profile") {
    if (!isProfileMetadataEnabled()) {
      addDialogueLine("system", "profile metadata disabled");
      return true;
    }

    const { userName, interests, lastVibe } = getCompanionProfile();
    addDialogueLine("system", `profile name: ${userName}`);
    addDialogueLine("system", `profile interests: ${interests.join(", ") || "none yet"}`);
    addDialogueLine("system", `profile vibe: ${lastVibe || "none yet"}`);
    return true;
  }

  if (name === "memory") {
    addDialogueLine("system", `${getMemorySummary()}`);
    formatMemorySection().split("\n").forEach((line) => {
      addDialogueLine("system", line);
    });
    return true;
  }

  if (name === "appearance") {
    getCurrentAppearanceSnapshot().split("\n").forEach((line) => {
      addDialogueLine("system", line);
    });
    return true;
  }

  if (name === "forget") {
    clearAllCompanionMemory();
    addDialogueLine("system", "all local memory cleared");
    showSpeechPhrase("I cleared the local memory.");
    return true;
  }

  return false;
}

function renderDialogueHistory() {
  dialogueHistory.innerHTML = "";
  dialogueController.messages
    .filter((message) => !message.hiddenUntilVoice)
    .forEach((message) => {
      const line = document.createElement("div");
      line.className = "dialogue-line";
      line.dataset.speaker = message.role;
      const prefix = {
        user: ">",
        assistant: "<",
        system: "#"
      }[message.role] || "#";
      line.textContent = `${prefix} ${message.content}`;
      dialogueHistory.append(line);
    });
  dialogueHistory.scrollTop = dialogueHistory.scrollHeight;
}

function addDialogueLine(role, content, options = {}) {
  const message = { role, content };
  if (options.hiddenUntilVoice) {
    message.hiddenUntilVoice = true;
  }
  dialogueController.messages.push(message);
  if (role === "user" || role === "assistant") {
    saveCompanionContext();
  }
  renderDialogueHistory();
  return message;
}

function addOllamaThinkingNotice() {
  addDialogueLine("system", OLLAMA_THINKING_MESSAGE);
}

function removeOllamaThinkingNotice() {
  dialogueController.messages = dialogueController.messages.filter(
    (message) => message.role !== "system" || message.content !== OLLAMA_THINKING_MESSAGE
  );
  renderDialogueHistory();
}

function getLastDialogueLine(role) {
  for (let index = dialogueController.messages.length - 1; index >= 0; index -= 1) {
    const message = dialogueController.messages[index];
    if (message.role === role) {
      return message;
    }
  }
  return null;
}

function addAssistantDialogueReply(reply, options = {}) {
  const cleanReply = reply.trim();
  if (!cleanReply) {
    return false;
  }
  if (options.dedupeRecent && getLastDialogueLine("assistant")?.content === cleanReply) {
    showSpeechPhrase(cleanReply);
    return null;
  }
  const message = addDialogueLine("assistant", cleanReply, {
    hiddenUntilVoice: options.hiddenUntilVoice
  });
  if (!message.hiddenUntilVoice) {
    showSpeechPhrase(cleanReply);
  }
  return message;
}

function revealAssistantDialogueReply(message) {
  if (!message?.hiddenUntilVoice) {
    return;
  }
  delete message.hiddenUntilVoice;
  renderDialogueHistory();
  showSpeechPhrase(message.content);
}

function shouldSkipContinuationGreeting() {
  const recentDialogue = dialogueController.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-2);
  return recentDialogue.length === 2 &&
    recentDialogue.every((message) => message.role === "assistant");
}

function hasStoredCompanionMemory() {
  const hasProfileMemory = isProfileMetadataEnabled() && (() => {
    const profile = getCompanionProfile();
    return isUsableUserName(profile.userName) ||
      profile.interests.length > 0 ||
      Boolean(profile.lastVibe);
  })();

  return (
    dialogueController.messages.some((message) => message.role === "user" || message.role === "assistant") ||
    dialogueController.memory.user.length > 0 ||
    dialogueController.memory.website.length > 0 ||
    hasProfileMemory
  );
}

function getContinuationGreeting() {
  const characterName = getCatchyCharacterName();
  const profileName = isProfileMetadataEnabled() ? getCompanionProfile().userName : "";
  const userName = isUsableUserName(profileName) ? profileName : "";

  if (hasStoredCompanionMemory()) {
    return userName
      ? `Welcome back, ${userName}. I still have our thread, so I'm picking up where we left off.`
      : "Welcome back. I still have our thread, so I'm picking up where we left off.";
  }

  return `Hi, I'm ${characterName}. Thanks for giving me a second to wake up.`;
}

function getContinuationGreetingPrompt() {
  const contextInstruction = isProfileMetadataEnabled()
    ? "Use the full recent chat context and saved memory to make it feel like she remembers where the conversation left off."
    : "Use the recent chat context to make it feel like she remembers where the conversation left off.";

  return [
    "Write Astera's short startup continuation greeting for this session.",
    contextInstruction,
    "Do not summarize the transcript, mention files, mention the scheduler, or explain that you are using memory.",
    "One natural sentence is best; two short sentences is the maximum."
  ].join(" ");
}

async function requestContinuationGreeting() {
  const response = await requestOllamaResponse(
    getContinuationGreetingPrompt(),
    {
      includeSavedMemory: true,
      transcriptLines: PERSISTED_CONTEXT_LINES,
      currentTurnGuidance: "The app just started. Write only Astera's brief continuation greeting using the full prior chat context.",
      appendPrompt: true,
      voice: true,
      retryCount: 1,
      retryDelayMs: 10000
    }
  );
  return {
    message: cleanCompanionReply(response.message) || getContinuationGreeting(),
    voice: response.voice
  };
}

async function runSchedulerCommand(command) {
  const normalizedCommand = command.trim().toLowerCase();
  if (normalizedCommand === "continue-greeting" || normalizedCommand === "continuation-greeting") {
    if (shouldSkipContinuationGreeting()) {
      return true;
    }

    try {
      addOllamaThinkingNotice();
      const response = await requestContinuationGreeting();
      const replyMessage = addAssistantDialogueReply(response.message, {
        hiddenUntilVoice: true
      });
      playCompanionVoice(response.voice, {
        onPlaybackStart: () => revealAssistantDialogueReply(replyMessage)
      });
    } catch (error) {
      console.warn("Continuation greeting failed", error);
      addAssistantDialogueReply(getContinuationGreeting());
    } finally {
      removeOllamaThinkingNotice();
    }
    return true;
  }

  addDialogueLine("system", `Unknown scheduler command: ${command}`);
  return false;
}

function shouldIncludeSavedMemory(prompt) {
  return isProfileMetadataEnabled() &&
    /\b(?:remember|memory|know about me|about me|my favorite|my name|name|interest|interests|i like|i prefer|vibe|mood|website|site|page|project|docs|teach|learned)\b/i.test(prompt);
}

function getCurrentTurnGuidance(prompt) {
  if (/^\s*(?:hi|hello|hey|yo|how are you|how's it going|how are things)[?!. ]*$/i.test(prompt)) {
    return "Latest user message is a casual greeting. Answer warmly without mentioning model names, filenames, appearance metadata, saved memory, docs, or website facts.";
  }

  return "Answer the latest user message directly. Mention appearance or model details only if the user asks about identity, looks, pose, motion, or the current scene.";
}

function getCompanionSystemPrompt() {
  if (isProfileMetadataEnabled()) {
    return COMPANION_SYSTEM_PROMPT;
  }

  return COMPANION_SYSTEM_PROMPT.replace(
    "Saved memory contains facts about the user and website; never treat user facts as your own experiences. ",
    ""
  );
}

function getOllamaMessages(currentPrompt = "", options = {}) {
  const transcriptLines = getRecentTranscriptLineLimit(options.transcriptLines || RECENT_TRANSCRIPT_LINES);
  const conversation = dialogueController.messages
    .filter((message) => message.role === "user" || message.role === "assistant");
  const recentConversation = takeLastItems(conversation, transcriptLines);
  const memoryContext = [
    getCompanionSystemPrompt(),
    "",
    "Current turn guidance:",
    options.currentTurnGuidance || getCurrentTurnGuidance(currentPrompt)
  ];

  if (isProfileMetadataEnabled() && (options.includeSavedMemory ?? shouldIncludeSavedMemory(currentPrompt))) {
    memoryContext.push(
      "",
      "Saved memory:",
      formatMemorySection()
    );
  }

  memoryContext.push(
    "",
    "Current appearance snapshot:",
    getCurrentAppearanceSnapshot(),
    "",
    "Recent transcript:",
    formatRecentTranscript(transcriptLines)
  );

  return [
    { role: "system", content: memoryContext.join("\n") },
    ...recentConversation
  ];
}

function cleanCompanionReply(reply) {
  return reply.trim().replace(/^["“](.*)["”]$/s, "$1").trim();
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function setCompanionFaceState(state, status, detail = "") {
  companionFace.dataset.state = state;
  companionFaceStatus.textContent = status;
  companionFace.title = detail || status;
  if (state === "idle" && companionBlinkController.frames.length > 0) {
    companionFaceIdle.src = companionBlinkController.frames[0];
  }
}

function releaseCompanionFaceMedia() {
  companionFaceVideo.pause();
  companionFaceVideo.removeAttribute("src");
  companionFaceVideo.load();
  if (companionVoiceController.objectUrl) {
    URL.revokeObjectURL(companionVoiceController.objectUrl);
    companionVoiceController.objectUrl = "";
  }
}

function revealPendingCompanionText() {
  const revealText = companionVoiceController.revealText;
  companionVoiceController.revealText = null;
  revealText?.();
}

function cancelCompanionVoice() {
  revealPendingCompanionText();
  companionVoiceController.requestId += 1;
  companionVoiceController.abortController?.abort();
  companionVoiceController.abortController = null;
  window.clearTimeout(companionVoiceController.resetTimer);
  companionVoiceController.resetTimer = 0;
  companionFacePlay.hidden = true;
  releaseCompanionFaceMedia();
}

function companionPortraitPath(faceModelId = faceModelController.selectedId) {
  const folder = String(faceModelId || "").trim();
  return folder
    ? `companion-voice/portrait?folder=${encodeURIComponent(folder)}`
    : "companion-voice/portrait";
}

function finishCompanionBlink() {
  companionBlinkController.active = false;
  if (companionBlinkController.frames.length > 0) {
    companionFaceIdle.src = companionBlinkController.frames[0];
  }
  const waiters = companionBlinkController.waiters.splice(0);
  waiters.forEach((resolve) => resolve());
}

function waitForCompanionBlinkCompletion() {
  if (!companionBlinkController.active) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    companionBlinkController.waiters.push(resolve);
  });
}

function updateCompanionFaceBlink(weight) {
  const frames = companionBlinkController.frames;
  if (frames.length < 2) return;
  const neutral = weight <= 0.001;
  if (companionFace.dataset.state !== "idle") {
    if (!neutral) {
      companionBlinkController.awaitNeutral = true;
    }
    return;
  }
  if (companionBlinkController.awaitNeutral) {
    companionFaceIdle.src = frames[0];
    if (neutral) {
      companionBlinkController.awaitNeutral = false;
    }
    return;
  }
  if (neutral) {
    if (companionBlinkController.active) {
      finishCompanionBlink();
    } else {
      companionFaceIdle.src = frames[0];
    }
    return;
  }
  companionBlinkController.active = true;
  const frameIndex = Math.min(
    frames.length - 1,
    Math.round(THREE.MathUtils.clamp(weight, 0, 1) * (frames.length - 1))
  );
  companionFaceIdle.src = frames[frameIndex];
}

async function loadCompanionBlinkAnimation(folderId) {
  const requestId = companionBlinkController.loadRequestId + 1;
  companionBlinkController.loadRequestId = requestId;
  companionBlinkController.folderId = folderId;
  companionBlinkController.frames = [];
  companionBlinkController.awaitNeutral = false;
  finishCompanionBlink();
  companionFaceIdle.src = appUrl(companionPortraitPath(folderId));
  try {
    const response = await fetch(
      appUrl(`companion-voice/idle-animation?folder=${encodeURIComponent(folderId)}`),
      { cache: "no-store" }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.available !== true || !Array.isArray(payload.frames)) {
      return;
    }
    const frames = payload.frames.map((frame) => appUrl(frame));
    await Promise.all(frames.map((source) => new Promise((resolve) => {
      const image = new Image();
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
      image.src = source;
    })));
    if (
      requestId !== companionBlinkController.loadRequestId ||
      folderId !== companionBlinkController.folderId
    ) {
      return;
    }
    companionBlinkController.frames = frames;
    companionFaceIdle.src = frames[0];
  } catch (error) {
    console.warn("Companion blink animation unavailable", error);
  }
}

function setFaceModel(id, syncUrl = true) {
  const selected = faceModelController.options.find((option) => option.id === id);
  if (!selected || selected.available === false) {
    return false;
  }
  if (syncUrl && selected.id !== faceModelController.selectedId) {
    cancelCompanionVoice();
  }
  faceModelController.selectedId = selected.id;
  faceModelSelect.value = selected.id;
  faceModelSelect.title = `${selected.label}: AnimaVisage face model`;
  document.documentElement.dataset.faceModel = selected.id;
  companionFaceIdle.src = appUrl(companionPortraitPath(selected.id));
  companionFaceVideo.poster = appUrl(companionPortraitPath(selected.id));
  companionFaceVideo.load();
  void loadCompanionBlinkAnimation(selected.id);
  if (syncUrl) {
    setPreviewUrlParam("faceModel", selected.id);
  }
  return true;
}

function populateFaceModelSelect(payload = {}, configuredId = "") {
  const options = Array.isArray(payload.models) ? payload.models : [];
  faceModelController.options = options.filter((option) => option?.id && option?.label);
  const availableOptions = faceModelController.options.filter(
    (option) => option.available !== false
  );
  faceModelSelect.innerHTML = "";

  if (availableOptions.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No voice-ready face models";
    option.selected = true;
    faceModelSelect.append(option);
    faceModelController.options.forEach((faceModel) => {
      const unavailable = document.createElement("option");
      unavailable.value = faceModel.id;
      unavailable.textContent = `${faceModel.label} — ${faceModel.message || "voice unavailable"}`;
      unavailable.disabled = true;
      faceModelSelect.append(unavailable);
    });
    faceModelSelect.disabled = true;
    faceModelSelect.title = "Render an AnimaVisage transition library to enable voice";
    return;
  }

  faceModelController.options.forEach((faceModel) => {
    const option = document.createElement("option");
    option.value = faceModel.id;
    option.textContent = faceModel.available === false
      ? `${faceModel.label} — ${faceModel.message || "voice unavailable"}`
      : faceModel.label;
    option.disabled = faceModel.available === false;
    option.title = faceModel.message || "Voice ready";
    faceModelSelect.append(option);
  });

  const requestedFromUrl = queryParams.get(PREVIEW_QUERY_KEYS.faceModel) || "";
  const requested = requestedFromUrl ||
    configuredId ||
    faceModelController.configuredId ||
    payload.selected ||
    availableOptions[0].id;
  const selected = availableOptions.some((option) => option.id === requested)
    ? requested
    : availableOptions[0].id;
  const unavailableRequested = faceModelController.options.find(
    (option) => option.id === requested && option.available === false
  );
  faceModelSelect.disabled = faceModelController.options.length <= 1;
  setFaceModel(selected, Boolean(requestedFromUrl && requestedFromUrl !== selected));
  if (unavailableRequested) {
    faceModelSelect.title = (
      `${unavailableRequested.label} is unavailable: ` +
      `${unavailableRequested.message || "render its transition library first"}. ` +
      `Using ${availableOptions.find((option) => option.id === selected)?.label || selected}.`
    );
  }
}

async function loadFaceModelOptions(configuredId = "") {
  try {
    const response = await fetch(appUrl("companion-voice/models"), { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Face models returned ${response.status}`);
    }
    populateFaceModelSelect(payload, configuredId);
  } catch (error) {
    populateFaceModelSelect();
    faceModelSelect.title = error instanceof Error ? error.message : "Face models unavailable";
  }
}

function applyConfiguredFaceModel(configuredId = "") {
  faceModelController.configuredId = configuredId;
  if (
    !configuredId ||
    queryParams.has(PREVIEW_QUERY_KEYS.faceModel)
  ) {
    return;
  }
  setFaceModel(configuredId, false);
}

function initializeCompanionFace() {
  companionFaceIdle.src = appUrl(companionPortraitPath());
  companionFaceVideo.poster = appUrl(companionPortraitPath());
  companionFaceVideo.load();
  setCompanionFaceState("idle", "Voice ready");
}

function companionVoiceCancelledError() {
  const error = new Error("Companion voice cancelled");
  error.name = "AbortError";
  return error;
}

function waitForMediaSourceOpen(mediaSource, signal) {
  return new Promise((resolve, reject) => {
    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleAbort = () => {
      cleanup();
      reject(companionVoiceCancelledError());
    };
    const cleanup = () => {
      mediaSource.removeEventListener("sourceopen", handleOpen);
      signal.removeEventListener("abort", handleAbort);
    };
    mediaSource.addEventListener("sourceopen", handleOpen, { once: true });
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function appendCompanionMediaChunk(sourceBuffer, chunk, signal) {
  return new Promise((resolve, reject) => {
    const handleEnd = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Could not buffer the companion voice stream"));
    };
    const handleAbort = () => {
      cleanup();
      reject(companionVoiceCancelledError());
    };
    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", handleEnd);
      sourceBuffer.removeEventListener("error", handleError);
      signal.removeEventListener("abort", handleAbort);
    };
    sourceBuffer.addEventListener("updateend", handleEnd, { once: true });
    sourceBuffer.addEventListener("error", handleError, { once: true });
    signal.addEventListener("abort", handleAbort, { once: true });
    sourceBuffer.appendBuffer(chunk);
  });
}

function createCompanionVideoEndWaiter(signal) {
  let terminalTime = null;
  let settled = false;
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const finish = () => {
    if (settled) return;
    settled = true;
    cleanup();
    resolvePromise();
  };
  const checkTerminalTime = () => {
    if (
      companionFaceVideo.ended ||
      (
        Number.isFinite(terminalTime) &&
        terminalTime > 0 &&
        companionFaceVideo.currentTime >= terminalTime - 0.05
      )
    ) {
      finish();
    }
  };
  const handleEnd = () => finish();
  const handlePause = () => checkTerminalTime();
  const handleTimeUpdate = () => checkTerminalTime();
  const handleError = () => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectPromise(new Error("Could not play the companion voice stream"));
  };
  const handleAbort = () => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectPromise(companionVoiceCancelledError());
  };
  const cleanup = () => {
    companionFaceVideo.removeEventListener("ended", handleEnd);
    companionFaceVideo.removeEventListener("pause", handlePause);
    companionFaceVideo.removeEventListener("timeupdate", handleTimeUpdate);
    companionFaceVideo.removeEventListener("error", handleError);
    signal.removeEventListener("abort", handleAbort);
  };

  companionFaceVideo.addEventListener("ended", handleEnd, { once: true });
  companionFaceVideo.addEventListener("pause", handlePause);
  companionFaceVideo.addEventListener("timeupdate", handleTimeUpdate);
  companionFaceVideo.addEventListener("error", handleError, { once: true });
  signal.addEventListener("abort", handleAbort, { once: true });

  return {
    promise,
    setTerminalTime(value) {
      terminalTime = Number(value);
      checkTerminalTime();
    }
  };
}

async function monitorCompanionVoiceSegment(segment, signal) {
  while (!signal.aborted) {
    const response = await fetch(appUrl(segment.status_url), {
      cache: "no-store",
      signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Voice status returned ${response.status}`);
    }
    if (payload.status === "complete") {
      return;
    }
    if (payload.status === "failed") {
      throw new Error(payload.message || "Companion voice render failed");
    }
    await wait(400);
  }
  throw companionVoiceCancelledError();
}

function startCompanionFacePlayback(index, count) {
  companionFaceVideo.play()
    .then(() => {
      revealPendingCompanionText();
      companionFacePlay.hidden = true;
      setCompanionFaceState(
        "playing",
        count > 1 ? `Speaking ${index + 1}/${count}` : "Speaking"
      );
    })
    .catch(() => {
      companionFacePlay.hidden = false;
      setCompanionFaceState("ready", "Tap to hear");
    });
}

async function playCompanionVoiceSegment(
  segment,
  index,
  count,
  startupBufferSeconds,
  signal
) {
  const mime = 'video/mp4; codecs="avc1.64002A, mp4a.40.2"';
  if (!window.MediaSource || !MediaSource.isTypeSupported(mime)) {
    throw new Error("This browser cannot play the buffered companion stream");
  }

  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  companionVoiceController.objectUrl = objectUrl;
  companionFaceVideo.src = objectUrl;
  companionFaceVideo.load();
  await waitForMediaSourceOpen(mediaSource, signal);
  const sourceBuffer = mediaSource.addSourceBuffer(mime);
  const response = await fetch(appUrl(segment.output_url), {
    cache: "no-store",
    signal
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Voice stream returned ${response.status}`);
  }

  const endWaiter = createCompanionVideoEndWaiter(signal);
  const reader = response.body.getReader();
  let playbackStarted = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    await appendCompanionMediaChunk(sourceBuffer, value, signal);
    const bufferedSeconds = companionFaceVideo.buffered.length > 0
      ? companionFaceVideo.buffered.end(companionFaceVideo.buffered.length - 1)
      : 0;
    if (!playbackStarted && bufferedSeconds >= startupBufferSeconds) {
      playbackStarted = true;
      companionFaceVideo.currentTime = 0;
      startCompanionFacePlayback(index, count);
    }
  }

  if (mediaSource.readyState === "open") {
    mediaSource.endOfStream();
  }
  const terminalTime = companionFaceVideo.buffered.length > 0
    ? companionFaceVideo.buffered.end(companionFaceVideo.buffered.length - 1)
    : companionFaceVideo.duration;
  endWaiter.setTerminalTime(terminalTime);
  if (!playbackStarted) {
    companionFaceVideo.currentTime = 0;
    startCompanionFacePlayback(index, count);
  }
  await endWaiter.promise;
  URL.revokeObjectURL(objectUrl);
  if (companionVoiceController.objectUrl === objectUrl) {
    companionVoiceController.objectUrl = "";
  }
}

async function playCompanionVoice(voice, options = {}) {
  cancelCompanionVoice();
  const requestId = companionVoiceController.requestId;
  companionVoiceController.revealText = options.onPlaybackStart || null;
  if (voice?.poster_url) {
    companionFaceVideo.poster = appUrl(voice.poster_url);
  }
  if (!voice?.available || !Array.isArray(voice.segments) || voice.segments.length === 0) {
    revealPendingCompanionText();
    const detail = voice?.error || "No companion voice stream was returned";
    setCompanionFaceState("error", "Voice offline", detail);
    console.warn("Companion voice unavailable", detail);
    return;
  }

  const controller = new AbortController();
  companionVoiceController.abortController = controller;
  await waitForCompanionBlinkCompletion();
  if (requestId !== companionVoiceController.requestId) {
    return;
  }
  setCompanionFaceState("buffering", "Preparing voice");

  try {
    for (const [index, segment] of voice.segments.entries()) {
      if (requestId !== companionVoiceController.requestId) {
        throw companionVoiceCancelledError();
      }
      setCompanionFaceState(
        "buffering",
        voice.segments.length > 1
          ? `Preparing ${index + 1}/${voice.segments.length}`
          : "Preparing voice"
      );
      await Promise.all([
        monitorCompanionVoiceSegment(segment, controller.signal),
        playCompanionVoiceSegment(
          segment,
          index,
          voice.segments.length,
          Number(voice.startup_buffer_seconds || 0),
          controller.signal
        )
      ]);
      if (index < voice.segments.length - 1 && voice.sentence_gap_ms > 0) {
        await wait(Number(voice.sentence_gap_ms));
      }
    }

    if (requestId !== companionVoiceController.requestId) {
      return;
    }
    setCompanionFaceState("idle", "Voice complete");
    companionVoiceController.abortController = null;
    companionVoiceController.resetTimer = window.setTimeout(() => {
      if (requestId !== companionVoiceController.requestId) {
        return;
      }
      releaseCompanionFaceMedia();
      setCompanionFaceState("idle", "Voice ready");
    }, 700);
  } catch (error) {
    if (error?.name === "AbortError" || requestId !== companionVoiceController.requestId) {
      return;
    }
    controller.abort();
    companionVoiceController.abortController = null;
    companionFacePlay.hidden = true;
    releaseCompanionFaceMedia();
    revealPendingCompanionText();
    const detail = error instanceof Error ? error.message : "Companion voice failed";
    setCompanionFaceState("error", "Voice error", detail);
    console.warn("Companion voice playback failed", error);
  }
}

async function requestOllamaResponse(prompt, options = {}) {
  const retryCount = Math.max(0, options.retryCount || 0);
  let lastError;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    if (attempt > 0) {
      await wait(options.retryDelayMs || 10000);
    }

    try {
      const response = await fetch(appUrl("ollama-chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          voice: options.voice === true,
          face_model: faceModelController.selectedId,
          messages: options.appendPrompt
            ? [
                ...getOllamaMessages(prompt, options),
                { role: "user", content: prompt }
              ]
            : getOllamaMessages(prompt, options)
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `Ollama returned ${response.status}`);
      }

      return {
        message: payload.message || "",
        voice: payload.voice || null
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function requestOllamaReply(prompt, options = {}) {
  return (await requestOllamaResponse(prompt, options)).message;
}

async function submitDialoguePrompt(prompt) {
  if (dialogueController.pending) {
    return;
  }

  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return;
  }

  if (/^\/\w+/.test(trimmedPrompt) || /^(?:remember|learn|teach)(?:\s+that)?\s+/i.test(trimmedPrompt) || /^(?:my name is|call me|i feel|i'm feeling|i am feeling|my vibe is|my mood is|mood is|vibe is)\s+/i.test(trimmedPrompt)) {
    dialogueInput.value = "";
    addDialogueLine("user", trimmedPrompt);
    if (!handleMemoryCommand(trimmedPrompt)) {
      addDialogueLine("system", "Unknown command. Try /name, /interest, /vibe, /remember, /teach, /memory, /profile, /appearance, or /forget.");
    }
    return;
  }

  dialogueController.pending = true;
  dialogueInput.value = "";
  dialogueInput.disabled = true;
  dialogueSendButton.disabled = true;
  addDialogueLine("user", trimmedPrompt);
  addOllamaThinkingNotice();
  await learnProfileFromPrompt(trimmedPrompt);

  try {
    const response = await requestOllamaResponse(trimmedPrompt, {
      voice: true
    });
    const reply = cleanCompanionReply(response.message);
    removeOllamaThinkingNotice();
    if (!reply) {
      addDialogueLine("system", `${OLLAMA_MODEL} returned an empty reply. Try again.`);
      return;
    }
    const replyMessage = addAssistantDialogueReply(reply, {
      hiddenUntilVoice: true
    });
    playCompanionVoice(response.voice, {
      onPlaybackStart: () => revealAssistantDialogueReply(replyMessage)
    });
  } catch (error) {
    removeOllamaThinkingNotice();
    addDialogueLine(
      "system",
      error instanceof Error ? error.message : "Ollama is unavailable"
    );
  } finally {
    dialogueController.pending = false;
    dialogueInput.disabled = false;
    dialogueSendButton.disabled = false;
    dialogueInput.focus();
  }
}

function getSpeechAnchorPosition() {
  if (!activeDancer) {
    return null;
  }

  const head = activeDancer.userData?.parts?.head;
  if (head) {
    head.getWorldPosition(speechWorldPosition);
    speechWorldPosition.y += 0.76;
    speechWorldPosition.x += 0.72;
    return speechWorldPosition;
  }

  activeDancer.updateMatrixWorld(true);
  modelBounds.setFromObject(activeDancer);
  if (modelBounds.isEmpty()) {
    return null;
  }

  modelBounds.getCenter(speechWorldPosition);
  speechWorldPosition.y = modelBounds.max.y + modelSize.y * 0.05;
  speechWorldPosition.x += Math.max(modelSize.x * 0.28, 0.34);
  return speechWorldPosition;
}

function updateSpeechBubblePosition() {
  if (
    performance.now() >= speechController.visibleUntil &&
    speechController.chunkIndex < speechController.chunks.length - 1
  ) {
    showSpeechChunk(speechController.chunkIndex + 1);
  }

  const anchor = getSpeechAnchorPosition();
  if (!anchor) {
    speechBubble.dataset.visible = "false";
    return;
  }

  speechAnchor.copy(anchor);
  speechScreenPosition.copy(speechAnchor).project(camera);
  const outsideClipSpace = speechScreenPosition.z < -1 || speechScreenPosition.z > 1;
  const speechIsActive = performance.now() < speechController.visibleUntil;
  speechBubble.dataset.visible = !outsideClipSpace && speechIsActive ? "true" : "false";

  if (outsideClipSpace) {
    return;
  }

  const bubbleWidth = speechBubble.offsetWidth;
  const bubbleHeight = speechBubble.offsetHeight;
  const rawX = (speechScreenPosition.x * 0.5 + 0.5) * window.innerWidth;
  const rawY = (-speechScreenPosition.y * 0.5 + 0.5) * window.innerHeight;
  const x = THREE.MathUtils.clamp(
    rawX,
    16 + bubbleWidth * 0.16,
    window.innerWidth - 16 - bubbleWidth * 0.84
  );
  const y = THREE.MathUtils.clamp(rawY, 18 + bubbleHeight, window.innerHeight - 134);
  speechBubble.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-16%, -100%)`;
}

function animateDancer(t, dancer = activeDancer) {
  const parts = dancer?.userData?.parts;
  if (!parts) {
    return;
  }

  const beat = Math.sin(t * 6.2);
  const halfBeat = Math.sin(t * 3.1);
  const quick = Math.sin(t * 12.4);

  dancer.position.y = 0.48 + Math.abs(beat) * 0.08;
  dancer.rotation.y = Math.PI + Math.sin(t * 1.15) * 0.22 + Math.sin(t * 0.47) * 0.1;

  parts.hips.rotation.z = halfBeat * 0.16;
  parts.hips.rotation.x = Math.sin(t * 3.1 + 0.8) * 0.08;
  parts.torso.rotation.z = -halfBeat * 0.14;
  parts.torso.rotation.x = Math.sin(t * 4.1) * 0.075;
  parts.head.rotation.z = Math.sin(t * 2.4 + 1.5) * 0.1;
  parts.head.rotation.y = Math.sin(t * 2.0) * 0.16;

  parts.arms.left.shoulder.rotation.set(0.16 + beat * 0.22, 0, -0.85 + halfBeat * 0.38);
  parts.arms.left.upperArm.rotation.z = -0.16 + Math.sin(t * 5.7) * 0.24;
  parts.arms.left.forearm.rotation.z = -0.4 + Math.sin(t * 6.2 + 0.6) * 0.35;

  parts.arms.right.shoulder.rotation.set(-0.18 + beat * 0.18, 0, 0.95 + halfBeat * 0.34);
  parts.arms.right.upperArm.rotation.z = 0.12 + Math.sin(t * 5.4 + 2.2) * 0.25;
  parts.arms.right.forearm.rotation.z = 0.42 + Math.sin(t * 6.1 + 1.7) * 0.32;

  parts.legs.left.thigh.rotation.x = 0.18 + Math.sin(t * 3.1) * 0.24;
  parts.legs.left.thigh.rotation.z = -0.12 + quick * 0.03;
  parts.legs.left.shin.rotation.x = -0.2 + Math.max(0, beat) * 0.18;
  parts.legs.right.thigh.rotation.x = 0.08 + Math.sin(t * 3.1 + Math.PI) * 0.2;
  parts.legs.right.thigh.rotation.z = 0.16 - quick * 0.03;
  parts.legs.right.shin.rotation.x = -0.12 + Math.max(0, -beat) * 0.2;

  parts.leftTail.rotation.z = -0.35 + Math.sin(t * 2.7 + 0.4) * 0.18;
  parts.leftTail.rotation.y = Math.sin(t * 3.4) * 0.2;
  parts.rightTail.rotation.z = 0.35 + Math.sin(t * 2.7 + 2.6) * 0.18;
  parts.rightTail.rotation.y = Math.sin(t * 3.4 + Math.PI) * 0.2;

  rimLight.intensity = 8.5 + Math.max(0, quick) * 2.4;
  magentaLight.intensity = 3.8 + Math.max(0, -quick) * 2;
  bloom.strength = 0.88 + Math.max(0, Math.sin(t * 6.2)) * 0.28;
}

function getMotionModeLabel(mode) {
  return getMotionModeOption(mode).label;
}

function getMotionModeOption(mode) {
  return motionController.options.find((option) => option.id === mode) || STILL_MOTION_OPTION;
}

function getMotionModeChoices() {
  return motionController.options.map((option) => option.id);
}

function pickMotionChoice(value) {
  return getMotionModeChoices().includes(value) ? value : STILL_MOTION_ID;
}

function isReadyVrmaMotionPreset(preset) {
  return preset?.ok && preset.url && (preset.kind || "vrma").toLowerCase() === "vrma";
}

function isProceduralMotionOption(option) {
  return option?.kind === "procedural";
}

function getIdleRandomTickProbability(delta) {
  return 1 - Math.exp(-delta / IDLE_RANDOM_TICK_AVERAGE_SECONDS);
}

function getIdleInterludeOption() {
  return getMotionModeOption(CASUAL_LOOK_AROUND_MOTION_ID);
}

function resetIdleInterludeSchedule({ startup = true } = {}) {
  motionController.idleInterludeClock = 0;
  motionController.idleInterludeNextAt = startup
    ? IDLE_RANDOM_TICK_FIRST_CHECK_SECONDS
    : IDLE_RANDOM_TICK_AVERAGE_SECONDS;
  motionController.idleInterludeStartupPending = startup;
}

function getIdleInterludeState() {
  if (motionController.poseTransition?.phase === "idle-interlude-in") {
    return "transitioning-in";
  }

  if (motionController.poseTransition?.phase === "idle-interlude-out") {
    return "transitioning-out";
  }

  if (motionController.idleInterludeAction) {
    return "playing";
  }

  if (motionController.idleInterludeMotionId) {
    return "playing";
  }

  if (motionController.idleInterludeLoadingId) {
    return "loading";
  }

  return motionController.idleInterludeStartupPending ? "startup-waiting" : "waiting";
}

function getMotionPlaybackState() {
  const selectedOption = getMotionModeOption(modelPreviewOptions.motion);
  const interludeOption = getIdleInterludeOption();
  const interludeState = getIdleInterludeState();
  const transition = motionController.poseTransition;
  const transitionOption = transition?.targetId
    ? getMotionModeOption(transition.targetId)
    : null;
  const isInterludeActive = Boolean(
    interludeOption &&
    selectedOption.id === IDLE_BREATHE_MOTION_ID &&
    (
      interludeState === "loading" ||
      interludeState === "playing" ||
      interludeState === "transitioning-in" ||
      interludeState === "transitioning-out"
    )
  );
  const effectiveOption = transition
    ? {
        id: transition.targetId || transitionOption?.id || selectedOption.id,
        label: transition.targetLabel || transitionOption?.label || selectedOption.label
      }
    : isInterludeActive
      ? interludeOption
      : selectedOption;

  return {
    selectedId: selectedOption.id,
    selectedLabel: selectedOption.label,
    effectiveId: effectiveOption.id,
    effectiveLabel: effectiveOption.label,
    effectiveStatus: transition
      ? transition.phase
      : isInterludeActive
        ? interludeState
        : motionController.status,
    interludeId: interludeOption?.id || "",
    interludeLabel: interludeOption?.label || "",
    interludeState,
    interludeNextIn: Math.max(
      0,
      motionController.idleInterludeNextAt - motionController.idleInterludeClock
    ),
    isInterludeActive
  };
}

function getMotionStatusSummary() {
  const motionState = getMotionPlaybackState();

  if (motionState.interludeState === "transitioning-out") {
    return `${motionState.selectedLabel} (transitioning from ${motionState.interludeLabel})`;
  }

  if (motionController.poseTransition && !motionState.isInterludeActive) {
    return `${motionState.effectiveLabel} (${motionState.effectiveStatus})`;
  }

  if (!motionState.isInterludeActive) {
    return motionState.selectedLabel;
  }

  return `${motionState.effectiveLabel} (${motionState.effectiveStatus}; ${motionState.selectedLabel} resumes)`;
}

function configureMotionOptions(state) {
  const configured = state?.scene?.modelPreview || {};
  const vrmaOptions = (state?.motionPresets || [])
    .filter(isReadyVrmaMotionPreset)
    .map((preset) => ({
      id: preset.id,
      label: preset.label,
      kind: "vrma",
      url: preset.url,
      path: preset.path,
      sourceId: preset.sourceId,
      loop: typeof preset.loop === "boolean" ? preset.loop : undefined,
      ok: true
    }));

  motionController.options = [STILL_MOTION_OPTION, ...PROCEDURAL_MOTION_OPTIONS, ...vrmaOptions];
  motionController.configured = true;
  modelPreviewOptions.motion = pickMotionChoice(
    pickFirstChoice(
      [
        queryParams.get("modelMotion"),
        configured.motion,
        configured.modelMotion
      ],
      getMotionModeChoices(),
      STILL_MOTION_ID
    )
  );
  populateMotionModeSelect();
}

function populateMotionModeSelect() {
  const selectedMotion = pickMotionChoice(modelPreviewOptions.motion);
  motionModeSelect.innerHTML = "";

  motionController.options.forEach((motion) => {
    const option = document.createElement("option");
    option.value = motion.id;
    option.textContent = motion.label;
    option.selected = motion.id === selectedMotion;
    motionModeSelect.append(option);
  });

  motionModeSelect.value = selectedMotion;
  motionModeSelect.disabled = motionController.options.length <= 1;
}

function restoreManualExpressionSelections() {
  activeVrm?.expressionManager?.resetValues?.();
  applyEyeMorphSelection();
  applyFaceEmoteSelection();
  applyOutfitMorphSelection();
}

function normalizeBoneAlias(value = "") {
  return String(value)
    .normalize("NFKC")
    .replace(/[\s_.\-:()[\]{}]/g, "")
    .toLowerCase();
}

function getSoulBoneIdForName(name = "") {
  const normalized = normalizeBoneAlias(name);
  if (!normalized) {
    return "";
  }

  return SOUL_BONE_ALIAS_LOOKUP.get(normalized) || "";
}

function cloneKeyframeTrack(track) {
  return track.clone();
}

function getAnimationTrackBinding(trackName = "") {
  const lastDot = trackName.lastIndexOf(".");
  if (lastDot === -1) {
    return null;
  }

  return {
    targetName: trackName.slice(0, lastDot),
    property: trackName.slice(lastDot + 1)
  };
}

function createSoulBoneRecord(boneId, node, options = {}) {
  const parentBoneId = options.parentBoneId ?? SOUL_BONE_PARENT_MAP[boneId] ?? "";
  const bindNode = options.bindNode || node;
  const positionNode = options.positionNode || bindNode;
  const rotationNode = options.rotationNode || bindNode;
  const scaleNode = options.scaleNode || bindNode;
  return {
    id: boneId,
    parentId: parentBoneId || "",
    sourceFormat: options.sourceFormat || "unknown",
    sourceName: node?.name || "",
    sourceAliases: [...new Set([
      boneId,
      ...(SOUL_BONE_ALIASES[boneId] || []),
      node?.name || ""
    ].filter(Boolean))],
    node,
    nodeName: node?.name || "",
    nodeUuid: node?.uuid || "",
    bindName: bindNode?.name || "",
    bindUuid: bindNode?.uuid || "",
    propertyNodes: {
      position: positionNode,
      quaternion: rotationNode,
      scale: scaleNode
    },
    propertyBindNames: {
      position: positionNode?.name || "",
      quaternion: rotationNode?.name || "",
      scale: scaleNode?.name || ""
    },
    rest: {
      position: node?.position?.toArray?.() || [0, 0, 0],
      rotation: node?.quaternion?.toArray?.() || [0, 0, 0, 1],
      scale: node?.scale?.toArray?.() || [1, 1, 1],
      propertyPosition: positionNode?.position?.toArray?.() || [0, 0, 0],
      propertyRotation: rotationNode?.quaternion?.toArray?.() || [0, 0, 0, 1],
      propertyScale: scaleNode?.scale?.toArray?.() || [1, 1, 1]
    }
  };
}

function collectThreeBones(root) {
  const bones = [];
  root?.traverse?.((object) => {
    if (object.isBone) {
      bones.push(object);
    }
  });
  return bones;
}

function createSoulSkeletonFromVrm(vrm) {
  const bones = new Map();
  const humanoid = vrm?.humanoid;
  if (!humanoid) {
    return null;
  }

  SOUL_BONE_IDS.forEach((boneId) => {
    const node = humanoid.getRawBoneNode?.(boneId);
    const bindNode = humanoid.getNormalizedBoneNode?.(boneId) || node;
    if (node || bindNode) {
      bones.set(
        boneId,
        createSoulBoneRecord(boneId, node || bindNode, {
          sourceFormat: "vrm",
          bindNode
        })
      );
    }
  });

  return {
    format: "soulecho-skeleton",
    version: 1,
    sourceFormat: "vrm",
    bones,
    unmappedBones: collectThreeBones(vrm.scene).filter((bone) => (
      ![...bones.values()].some((record) => record.node === bone)
    )).map((bone) => ({
      sourceName: bone.name,
      node: bone,
      nodeUuid: bone.uuid,
      parentName: bone.parent?.name || ""
    }))
  };
}

function createSoulSkeletonFromMmd(root, sourceFormat = "mmd") {
  const bones = new Map();
  const unmappedBones = [];
  const sourceBones = collectThreeBones(root);

  sourceBones.forEach((bone) => {
    const boneId = getSoulBoneIdForName(bone.name);
    if (!boneId) {
      unmappedBones.push({
        sourceName: bone.name,
        node: bone,
        nodeUuid: bone.uuid,
        parentName: bone.parent?.name || ""
      });
      return;
    }

    if (!bones.has(boneId)) {
      bones.set(
        boneId,
        createSoulBoneRecord(boneId, bone, {
          sourceFormat
        })
      );
    }
  });

  const centerBone = sourceBones.find((bone) => (
    bone.name === "センター" || normalizeBoneAlias(bone.name) === "center"
  ));
  const lowerBodyBone = sourceBones.find((bone) => bone.name === "下半身");
  if (centerBone || lowerBodyBone) {
    bones.set(
      "hips",
      createSoulBoneRecord("hips", lowerBodyBone || centerBone, {
        sourceFormat,
        bindNode: lowerBodyBone || centerBone,
        positionNode: centerBone || lowerBodyBone,
        rotationNode: lowerBodyBone || centerBone,
        scaleNode: lowerBodyBone || centerBone
      })
    );
  }

  return {
    format: "soulecho-skeleton",
    version: 1,
    sourceFormat,
    bones,
    unmappedBones
  };
}

function createSoulSkeleton(root, { kind = "model", vrm = null } = {}) {
  const skeleton = kind === "vrm"
    ? createSoulSkeletonFromVrm(vrm)
    : createSoulSkeletonFromMmd(root, kind === "pmx" || kind === "pmd" ? "mmd" : kind);

  if (!skeleton) {
    return null;
  }

  skeleton.boneList = [...skeleton.bones.values()];
  skeleton.boneIds = skeleton.boneList.map((bone) => bone.id);
  skeleton.bindNameToBoneId = new Map(
    skeleton.boneList
      .flatMap((bone) => [
        [bone.bindName, bone.id],
        [THREE.PropertyBinding.sanitizeNodeName(bone.bindName), bone.id],
        [bone.nodeName, bone.id],
        [THREE.PropertyBinding.sanitizeNodeName(bone.nodeName), bone.id],
        [bone.sourceName, bone.id],
        ...Object.values(bone.propertyBindNames || {}).flatMap((name) => [
          [name, bone.id],
          [THREE.PropertyBinding.sanitizeNodeName(name), bone.id]
        ])
      ])
      .filter(([name]) => Boolean(name))
  );
  return skeleton;
}

function serializeSoulSkeletonForDebug(skeleton) {
  if (!skeleton) {
    return null;
  }

  return {
    format: skeleton.format,
    version: skeleton.version,
    sourceFormat: skeleton.sourceFormat,
    mappedBones: skeleton.boneList.length,
    canonicalBones: skeleton.boneIds,
    unmappedBones: skeleton.unmappedBones.map((bone) => bone.sourceName).filter(Boolean)
  };
}

function serializeSoulAnimationForDebug(soulAnimation) {
  if (!soulAnimation) {
    return null;
  }

  return {
    format: soulAnimation.format,
    version: soulAnimation.version,
    sourceFormat: soulAnimation.sourceFormat,
    name: soulAnimation.name,
    duration: soulAnimation.duration,
    boneTracks: soulAnimation.boneTracks.length,
    auxiliaryTracks: soulAnimation.auxiliaryTracks.length,
    animatedBones: [...new Set(soulAnimation.boneTracks.map((track) => track.boneId))],
    loopAnalysis: soulAnimation.loopAnalysis || null
  };
}

function getActiveSoulSkeleton() {
  return realDancer?.userData?.soulEchoModel?.skeleton || null;
}

function getActiveMotionRoot() {
  return activeVrm?.scene || realDancer || null;
}

function hasModelPoseTarget() {
  return Boolean(activeVrm?.humanoid || getActiveSoulSkeleton()?.boneList?.length);
}

function getCurrentSoulPose() {
  const skeleton = getActiveSoulSkeleton();
  if (!skeleton) {
    return {};
  }

  return Object.fromEntries(
    skeleton.boneList.map((bone) => [
      bone.id,
      {
        position: bone.propertyNodes.position.position.toArray(),
        rotation: bone.propertyNodes.quaternion.quaternion.toArray(),
        scale: bone.propertyNodes.scale.scale.toArray()
      }
    ])
  );
}

function getRestSoulPose() {
  const skeleton = getActiveSoulSkeleton();
  if (!skeleton) {
    return {};
  }

  return Object.fromEntries(
    skeleton.boneList.map((bone) => [
      bone.id,
      {
        position: [...bone.rest.propertyPosition],
        rotation: [...bone.rest.propertyRotation],
        scale: [...bone.rest.propertyScale]
      }
    ])
  );
}

function applySoulPose(pose = {}) {
  const skeleton = getActiveSoulSkeleton();
  if (!skeleton) {
    return;
  }

  Object.entries(pose).forEach(([boneId, transform]) => {
    const bone = skeleton.bones.get(boneId);
    if (!bone) {
      return;
    }

    if (Array.isArray(transform.position)) {
      bone.propertyNodes.position?.position.fromArray(transform.position);
    }
    if (Array.isArray(transform.rotation)) {
      bone.propertyNodes.quaternion?.quaternion.fromArray(transform.rotation).normalize();
    }
    if (Array.isArray(transform.scale)) {
      bone.propertyNodes.scale?.scale.fromArray(transform.scale);
    }
  });
  realDancer?.updateMatrixWorld(true);
}

function resetSoulPose() {
  applySoulPose(getRestSoulPose());
}

function getSoulBoneIdForTrackTarget(targetName, skeleton = getActiveSoulSkeleton()) {
  if (!targetName || !skeleton) {
    return "";
  }

  return skeleton.bindNameToBoneId.get(targetName) ||
    skeleton.bindNameToBoneId.get(THREE.PropertyBinding.sanitizeNodeName(targetName)) ||
    getSoulBoneIdForName(targetName);
}

function isBoneTransformProperty(property = "") {
  return property === "position" || property === "quaternion" || property === "scale";
}

function createSoulAnimationFromClip(clip, skeleton = getActiveSoulSkeleton(), options = {}) {
  const boneTracks = [];
  const auxiliaryTracks = [];

  clip.tracks.forEach((track) => {
    const binding = getAnimationTrackBinding(track.name);
    const boneId = binding && isBoneTransformProperty(binding.property)
      ? getSoulBoneIdForTrackTarget(binding.targetName, skeleton)
      : "";

    if (!binding || !boneId) {
      auxiliaryTracks.push(cloneKeyframeTrack(track));
      return;
    }

    boneTracks.push({
      boneId,
      property: binding.property,
      sourceTrackName: track.name,
      track: cloneKeyframeTrack(track)
    });
  });

  const soulAnimation = {
    format: "soulecho-animation",
    version: 1,
    sourceFormat: options.sourceFormat || "three",
    name: options.name || clip.name || "Motion",
    duration: clip.duration,
    boneTracks,
    auxiliaryTracks
  };
  soulAnimation.loopAnalysis = analyzeSoulAnimationLoop(soulAnimation);
  return soulAnimation;
}

function getSkeletonBoneWorldHeight(skeleton, boneId) {
  const node = skeleton?.bones.get(boneId)?.node;
  if (!node) {
    return 0;
  }

  const position = new THREE.Vector3();
  node.getWorldPosition(position);
  return position.y;
}

function cloneAndScalePositionTrack(track, scale) {
  const clone = cloneKeyframeTrack(track);
  if (scale === 1) {
    return clone;
  }

  clone.values = new Float32Array(
    [...clone.values].map((value, index) => (
      index % 3 === 1 ? value * scale : value
    ))
  );
  return clone;
}

function getTrackValueSize(track) {
  if (typeof track.getValueSize === "function") {
    return track.getValueSize();
  }

  return Math.max(1, Math.floor(track.values.length / Math.max(track.times.length, 1)));
}

function getTrackEndpointValues(track, valueSize) {
  if (!track?.times?.length || track.times.length < 2 || track.values.length < valueSize * 2) {
    return null;
  }

  const first = [...track.values.slice(0, valueSize)];
  const lastStart = track.values.length - valueSize;
  const last = [...track.values.slice(lastStart, lastStart + valueSize)];
  return { first, last };
}

function getVectorEndpointDistance(track, valueSize = 3) {
  const endpoints = getTrackEndpointValues(track, valueSize);
  if (!endpoints) {
    return 0;
  }

  let squared = 0;
  for (let index = 0; index < valueSize; index += 1) {
    squared += (endpoints.last[index] - endpoints.first[index]) ** 2;
  }
  return Math.sqrt(squared);
}

function getQuaternionEndpointAngle(track) {
  const endpoints = getTrackEndpointValues(track, 4);
  if (!endpoints) {
    return 0;
  }

  const first = new THREE.Quaternion().fromArray(endpoints.first).normalize();
  const last = new THREE.Quaternion().fromArray(endpoints.last).normalize();
  return 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(first.dot(last)), 0, 1));
}

function getScalarEndpointDelta(track) {
  const endpoints = getTrackEndpointValues(track, 1);
  if (!endpoints) {
    return 0;
  }

  return Math.abs(endpoints.last[0] - endpoints.first[0]);
}

function analyzeSoulAnimationLoop(soulAnimation) {
  const analysis = {
    loopHint: "unknown",
    shouldLoop: false,
    comparableTracks: 0,
    firstLastPoseDelta: {
      positionMax: 0,
      rootPosition: 0,
      rotationMaxRadians: 0,
      scaleMax: 0,
      scalarMax: 0
    },
    thresholds: {
      position: MOTION_LOOP_POSITION_EPSILON,
      rootPosition: MOTION_LOOP_ROOT_POSITION_EPSILON,
      rotationRadians: MOTION_LOOP_ROTATION_EPSILON,
      scale: MOTION_LOOP_SCALE_EPSILON,
      scalar: MOTION_LOOP_SCALAR_EPSILON
    }
  };

  soulAnimation.boneTracks.forEach((boneTrack) => {
    if (boneTrack.track?.times?.length < 2) {
      return;
    }

    analysis.comparableTracks += 1;
    if (boneTrack.property === "position") {
      const distance = getVectorEndpointDistance(boneTrack.track, 3);
      if (boneTrack.boneId === "hips") {
        analysis.firstLastPoseDelta.rootPosition = Math.max(
          analysis.firstLastPoseDelta.rootPosition,
          distance
        );
      } else {
        analysis.firstLastPoseDelta.positionMax = Math.max(
          analysis.firstLastPoseDelta.positionMax,
          distance
        );
      }
    } else if (boneTrack.property === "quaternion") {
      analysis.firstLastPoseDelta.rotationMaxRadians = Math.max(
        analysis.firstLastPoseDelta.rotationMaxRadians,
        getQuaternionEndpointAngle(boneTrack.track)
      );
    } else if (boneTrack.property === "scale") {
      analysis.firstLastPoseDelta.scaleMax = Math.max(
        analysis.firstLastPoseDelta.scaleMax,
        getVectorEndpointDistance(boneTrack.track, 3)
      );
    }
  });

  soulAnimation.auxiliaryTracks.forEach((track) => {
    const valueSize = getTrackValueSize(track);
    if (track?.times?.length < 2) {
      return;
    }

    analysis.comparableTracks += 1;
    if (valueSize === 1) {
      analysis.firstLastPoseDelta.scalarMax = Math.max(
        analysis.firstLastPoseDelta.scalarMax,
        getScalarEndpointDelta(track)
      );
    } else if (valueSize === 4 && track.name.endsWith(".quaternion")) {
      analysis.firstLastPoseDelta.rotationMaxRadians = Math.max(
        analysis.firstLastPoseDelta.rotationMaxRadians,
        getQuaternionEndpointAngle(track)
      );
    } else if (valueSize === 3) {
      analysis.firstLastPoseDelta.positionMax = Math.max(
        analysis.firstLastPoseDelta.positionMax,
        getVectorEndpointDistance(track, 3)
      );
    }
  });

  if (analysis.comparableTracks === 0) {
    return analysis;
  }

  const poseMatches =
    analysis.firstLastPoseDelta.positionMax <= MOTION_LOOP_POSITION_EPSILON &&
    analysis.firstLastPoseDelta.rotationMaxRadians <= MOTION_LOOP_ROTATION_EPSILON &&
    analysis.firstLastPoseDelta.scaleMax <= MOTION_LOOP_SCALE_EPSILON &&
    analysis.firstLastPoseDelta.scalarMax <= MOTION_LOOP_SCALAR_EPSILON;
  const rootMoves = analysis.firstLastPoseDelta.rootPosition > MOTION_LOOP_ROOT_POSITION_EPSILON;

  if (poseMatches && !rootMoves) {
    analysis.loopHint = "seamless";
    analysis.shouldLoop = true;
  } else if (poseMatches && rootMoves) {
    analysis.loopHint = "cyclic-root-motion";
    analysis.shouldLoop = false;
  } else {
    analysis.loopHint = "one-shot";
    analysis.shouldLoop = false;
  }

  return analysis;
}

function applySoulAnimationLoopOverride(soulAnimation, option = {}) {
  if (!soulAnimation?.loopAnalysis || typeof option.loop !== "boolean") {
    return soulAnimation;
  }

  soulAnimation.loopAnalysis = {
    ...soulAnimation.loopAnalysis,
    inferredLoopHint: soulAnimation.loopAnalysis.loopHint,
    inferredShouldLoop: soulAnimation.loopAnalysis.shouldLoop,
    loopHint: option.loop ? "metadata-loop" : "metadata-one-shot",
    shouldLoop: option.loop,
    source: "motion-preset"
  };
  return soulAnimation;
}

function createSoulAnimationFromVrmAnimation(vrmAnimation, skeleton = getActiveSoulSkeleton(), options = {}) {
  const sourceHipsHeight = Math.abs(vrmAnimation?.restHipsPosition?.y || 0);
  const targetHipsHeight = Math.abs(getSkeletonBoneWorldHeight(skeleton, "hips"));
  const hipsScale = sourceHipsHeight > 1e-5 && targetHipsHeight > 1e-5
    ? targetHipsHeight / sourceHipsHeight
    : 1;
  const boneTracks = [];

  vrmAnimation?.humanoidTracks?.rotation?.forEach((track, boneId) => {
    boneTracks.push({
      boneId,
      property: "quaternion",
      sourceTrackName: track.name,
      track: cloneKeyframeTrack(track)
    });
  });

  vrmAnimation?.humanoidTracks?.translation?.forEach((track, boneId) => {
    boneTracks.push({
      boneId,
      property: "position",
      sourceTrackName: track.name,
      track: cloneAndScalePositionTrack(track, boneId === "hips" ? hipsScale : 1)
    });
  });

  const soulAnimation = {
    format: "soulecho-animation",
    version: 1,
    sourceFormat: options.sourceFormat || "vrma",
    name: options.name || "Motion",
    duration: vrmAnimation?.duration || 0,
    boneTracks,
    auxiliaryTracks: []
  };
  soulAnimation.loopAnalysis = analyzeSoulAnimationLoop(soulAnimation);
  return soulAnimation;
}

function getSoulBoneTrackNode(bone, property) {
  return bone?.propertyNodes?.[property] || bone?.node || null;
}

function getSoulBoneTrackRest(bone, property) {
  if (property === "position") {
    return bone?.rest?.propertyPosition || bone?.rest?.position || [0, 0, 0];
  }
  if (property === "quaternion") {
    return bone?.rest?.propertyRotation || bone?.rest?.rotation || [0, 0, 0, 1];
  }
  if (property === "scale") {
    return bone?.rest?.propertyScale || bone?.rest?.scale || [1, 1, 1];
  }
  return [];
}

function retargetPositionTrackToRest(track, restPosition) {
  const clone = cloneKeyframeTrack(track);
  if (clone.values.length < 3) {
    return clone;
  }

  const base = [
    clone.values[0],
    clone.values[1],
    clone.values[2]
  ];
  const values = new Float32Array(clone.values.length);
  for (let index = 0; index < clone.values.length; index += 3) {
    values[index] = restPosition[0] + clone.values[index] - base[0];
    values[index + 1] = restPosition[1] + clone.values[index + 1] - base[1];
    values[index + 2] = restPosition[2] + clone.values[index + 2] - base[2];
  }
  clone.values = values;
  return clone;
}

function retargetQuaternionTrackToRest(track, restRotation) {
  const clone = cloneKeyframeTrack(track);
  if (clone.values.length < 4) {
    return clone;
  }

  const rest = new THREE.Quaternion().fromArray(restRotation).normalize();
  const animated = new THREE.Quaternion();
  const retargeted = new THREE.Quaternion();
  const values = new Float32Array(clone.values.length);
  for (let index = 0; index < clone.values.length; index += 4) {
    animated.fromArray(clone.values, index).normalize();
    retargeted.copy(rest).multiply(animated).normalize();
    retargeted.toArray(values, index);
  }
  clone.values = values;
  return clone;
}

function retargetScaleTrackToRest(track, restScale) {
  const clone = cloneKeyframeTrack(track);
  if (clone.values.length < 3) {
    return clone;
  }

  const values = new Float32Array(clone.values.length);
  for (let index = 0; index < clone.values.length; index += 3) {
    values[index] = restScale[0] * clone.values[index];
    values[index + 1] = restScale[1] * clone.values[index + 1];
    values[index + 2] = restScale[2] * clone.values[index + 2];
  }
  clone.values = values;
  return clone;
}

function retargetSoulTrackForSkeleton(boneTrack, bone, skeleton) {
  if (skeleton.sourceFormat === "vrm") {
    return cloneKeyframeTrack(boneTrack.track);
  }

  const rest = getSoulBoneTrackRest(bone, boneTrack.property);
  if (boneTrack.property === "position") {
    return retargetPositionTrackToRest(boneTrack.track, rest);
  }
  if (boneTrack.property === "quaternion") {
    return retargetQuaternionTrackToRest(boneTrack.track, rest);
  }
  if (boneTrack.property === "scale") {
    return retargetScaleTrackToRest(boneTrack.track, rest);
  }

  return cloneKeyframeTrack(boneTrack.track);
}

function compileSoulAnimationClip(soulAnimation, skeleton = getActiveSoulSkeleton()) {
  if (!soulAnimation || !skeleton) {
    return null;
  }

  const tracks = [];
  soulAnimation.boneTracks.forEach((boneTrack) => {
    const bone = skeleton.bones.get(boneTrack.boneId);
    const targetNode = getSoulBoneTrackNode(bone, boneTrack.property);
    const targetName = targetNode?.name || bone?.bindName || bone?.nodeName;
    if (!targetName) {
      return;
    }

    const track = retargetSoulTrackForSkeleton(boneTrack, bone, skeleton);
    track.name = `${targetName}.${boneTrack.property}`;
    tracks.push(track);
  });
  soulAnimation.auxiliaryTracks.forEach((track) => tracks.push(cloneKeyframeTrack(track)));

  const clip = new THREE.AnimationClip(soulAnimation.name, soulAnimation.duration, tracks);
  clip.userData = { ...(clip.userData || {}) };
  clip.userData.soulEchoAnimation = soulAnimation;
  return clip;
}

function translateClipToSoulFormat(clip, skeleton = getActiveSoulSkeleton(), options = {}) {
  const soulAnimation = createSoulAnimationFromClip(clip, skeleton, options);
  const translatedClip = compileSoulAnimationClip(soulAnimation, skeleton) || clip;
  translatedClip.name = options.name || clip.name;
  translatedClip.userData = { ...(translatedClip.userData || {}) };
  translatedClip.userData.soulEchoAnimation = soulAnimation;
  return translatedClip;
}

function resetLoadedModelMotion({ resetExpressions = true } = {}) {
  motionController.loadingId = null;
  motionController.idleInterludeLoadingId = null;
  clearPoseTransition();
  stopIdleInterlude();
  resetIdleInterludeSchedule();

  stopLoadedMotionPlayback();
  motionController.status = "idle";
  motionController.error = "";
  motionController.proceduralTime = 0;
  motionController.proceduralBasePose = null;
  motionController.proceduralBasePoseKey = "";
  motionController.proceduralBasePosePromise = null;
  resetModelPose();

  if (resetExpressions) {
    restoreManualExpressionSelections();
  }
}

function ensureVrmLookAtQuaternionProxy(vrm) {
  if (!vrm?.lookAt || !vrm.scene) {
    return;
  }

  let proxy = vrm.scene.children.find((child) => child instanceof VRMLookAtQuaternionProxy);
  if (!proxy) {
    proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
    vrm.scene.add(proxy);
  }
  if (!proxy.name) {
    proxy.name = "VRMLookAtQuaternionProxy";
  }
}

function loadVrmAnimationClip(option) {
  const cacheKey = `${getActiveMotionRoot()?.uuid || "none"}:${option.id}`;
  const cached = motionController.clipCache.get(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

  return new Promise((resolve, reject) => {
    loader.load(
      option.url,
      (gltf) => {
        const vrmAnimation = gltf.userData.vrmAnimations?.[0];
        if (!vrmAnimation) {
          reject(new Error(`No VRM animation found in ${option.label}`));
          return;
        }

        const skeleton = getActiveSoulSkeleton();
        let clip;
        if (activeVrm?.humanoid) {
          ensureVrmLookAtQuaternionProxy(activeVrm);
          const nativeClip = createVRMAnimationClip(vrmAnimation, activeVrm);
          nativeClip.name = option.label;
          clip = translateClipToSoulFormat(
            nativeClip,
            skeleton,
            {
              sourceFormat: "vrma",
              name: option.label
            }
          );
          applySoulAnimationLoopOverride(clip.userData?.soulEchoAnimation, option);
        } else {
          const soulAnimation = createSoulAnimationFromVrmAnimation(
            vrmAnimation,
            skeleton,
            {
              sourceFormat: "vrma",
              name: option.label
            }
          );
          applySoulAnimationLoopOverride(soulAnimation, option);
          clip = compileSoulAnimationClip(soulAnimation, skeleton);
        }

        if (!clip) {
          reject(new Error(`Motion ${option.label} could not bind to the active model`));
          return;
        }

        clip.name = option.label;
        clip.userData = {
          ...(clip.userData || {}),
          motionOption: {
            id: option.id,
            label: option.label,
            sourceFormat: "vrma",
            path: option.path || ""
          }
        };
        motionController.clipCache.set(cacheKey, clip);
        resolve(clip);
      },
      undefined,
      reject
    );
  });
}

function clonePoseTransform(transform = {}) {
  const clone = {};

  if (Array.isArray(transform.position)) {
    clone.position = [...transform.position];
  }

  if (Array.isArray(transform.rotation)) {
    clone.rotation = [...transform.rotation];
  }

  return clone;
}

function cloneNormalizedPose(pose = {}) {
  return Object.fromEntries(
    Object.entries(pose).map(([boneName, transform]) => [
      boneName,
      clonePoseTransform(transform)
    ])
  );
}

function getCurrentNormalizedPose() {
  if (!activeVrm?.humanoid?.getNormalizedPose) {
    return {};
  }

  return cloneNormalizedPose(activeVrm.humanoid.getNormalizedPose());
}

function applyNormalizedPose(pose = {}) {
  if (!activeVrm?.humanoid) {
    return;
  }

  activeVrm.humanoid.resetNormalizedPose?.();
  activeVrm.humanoid.setNormalizedPose?.(pose);
  activeVrm.update?.(0);
}

function getCurrentModelPose() {
  return activeVrm?.humanoid ? getCurrentNormalizedPose() : getCurrentSoulPose();
}

function getRestModelPose() {
  return activeVrm?.humanoid ? {} : getRestSoulPose();
}

function applyModelPose(pose = {}) {
  if (activeVrm?.humanoid) {
    applyNormalizedPose(pose);
    return;
  }

  applySoulPose(pose);
}

function resetModelPose() {
  if (activeVrm?.humanoid) {
    activeVrm.humanoid.resetNormalizedPose?.();
    activeVrm?.update?.(0);
    return;
  }

  resetSoulPose();
}

function getPosePosition(transform = {}) {
  return Array.isArray(transform.position)
    ? new THREE.Vector3().fromArray(transform.position)
    : new THREE.Vector3();
}

function getPoseRotation(transform = {}) {
  return Array.isArray(transform.rotation)
    ? new THREE.Quaternion().fromArray(transform.rotation).normalize()
    : new THREE.Quaternion();
}

function getMotionPlan(distance, maxSpeed, acceleration, deceleration) {
  if (distance <= 1e-6) {
    return {
      distance: 0,
      duration: 0,
      sample: () => 1
    };
  }

  const safeMaxSpeed = Math.max(maxSpeed, 1e-6);
  const safeAcceleration = Math.max(acceleration, 1e-6);
  const safeDeceleration = Math.max(deceleration, 1e-6);
  const accelDistance = (safeMaxSpeed * safeMaxSpeed) / (2 * safeAcceleration);
  const decelDistance = (safeMaxSpeed * safeMaxSpeed) / (2 * safeDeceleration);

  let peakSpeed = safeMaxSpeed;
  let cruiseDistance = distance - accelDistance - decelDistance;
  if (cruiseDistance < 0) {
    peakSpeed = Math.sqrt(
      (2 * distance * safeAcceleration * safeDeceleration) /
      (safeAcceleration + safeDeceleration)
    );
    cruiseDistance = 0;
  }

  const accelTime = peakSpeed / safeAcceleration;
  const decelTime = peakSpeed / safeDeceleration;
  const cruiseTime = cruiseDistance / peakSpeed;
  const actualAccelDistance = (peakSpeed * peakSpeed) / (2 * safeAcceleration);
  const duration = accelTime + cruiseTime + decelTime;

  return {
    distance,
    duration,
    sample: (elapsed) => {
      if (elapsed <= 0) {
        return 0;
      }

      if (elapsed >= duration) {
        return 1;
      }

      let coveredDistance;
      if (elapsed < accelTime) {
        coveredDistance = 0.5 * safeAcceleration * elapsed * elapsed;
      } else if (elapsed < accelTime + cruiseTime) {
        coveredDistance = actualAccelDistance + peakSpeed * (elapsed - accelTime);
      } else {
        const decelElapsed = elapsed - accelTime - cruiseTime;
        coveredDistance =
          actualAccelDistance +
          cruiseDistance +
          peakSpeed * decelElapsed -
          0.5 * safeDeceleration * decelElapsed * decelElapsed;
      }

      return THREE.MathUtils.clamp(coveredDistance / distance, 0, 1);
    }
  };
}

function getLinearTransitionPlan(distance) {
  return getMotionPlan(
    distance,
    MOTION_TRANSITION_LINEAR_MAX_SPEED,
    MOTION_TRANSITION_LINEAR_ACCELERATION,
    MOTION_TRANSITION_LINEAR_DECELERATION
  );
}

function getAngularTransitionPlan(angle) {
  return getMotionPlan(
    angle,
    MOTION_TRANSITION_ANGULAR_MAX_SPEED,
    MOTION_TRANSITION_ANGULAR_ACCELERATION,
    MOTION_TRANSITION_ANGULAR_DECELERATION
  );
}

function createPoseTransitionTrack(boneName, fromTransform = {}, toTransform = {}) {
  const fromPosition = getPosePosition(fromTransform);
  const toPosition = getPosePosition(toTransform);
  const fromRotation = getPoseRotation(fromTransform);
  const toRotation = getPoseRotation(toTransform);
  if (fromRotation.dot(toRotation) < 0) {
    toRotation.set(-toRotation.x, -toRotation.y, -toRotation.z, -toRotation.w);
  }

  const positionPlan = getLinearTransitionPlan(fromPosition.distanceTo(toPosition));
  const rotationPlan = getAngularTransitionPlan(fromRotation.angleTo(toRotation));

  return {
    boneName,
    fromPosition,
    toPosition,
    positionPlan,
    fromRotation,
    toRotation,
    rotationPlan,
    duration: Math.max(positionPlan.duration, rotationPlan.duration)
  };
}

function createPoseTransition(fromPose = {}, toPose = {}, options = {}) {
  const boneNames = new Set([
    ...Object.keys(fromPose),
    ...Object.keys(toPose)
  ]);
  const tracks = [...boneNames].map((boneName) => (
    createPoseTransitionTrack(boneName, fromPose[boneName], toPose[boneName])
  ));
  const duration = Math.max(
    MOTION_TRANSITION_MIN_SECONDS,
    ...tracks.map((track) => track.duration)
  );

  return {
    elapsed: 0,
    duration,
    tracks,
    targetId: options.targetId || "",
    targetLabel: options.targetLabel || "",
    phase: options.phase || "transitioning",
    onComplete: options.onComplete || null
  };
}

function samplePoseTransition(transition, elapsed) {
  const pose = {};

  transition.tracks.forEach((track) => {
    const transform = {};
    const positionProgress = track.positionPlan.sample(elapsed);
    const rotationProgress = track.rotationPlan.sample(elapsed);
    transform.position = track.fromPosition.clone().lerp(
      track.toPosition,
      positionProgress
    ).toArray();
    transform.rotation = track.fromRotation.clone().slerp(
      track.toRotation,
      rotationProgress
    ).toArray();
    pose[track.boneName] = transform;
  });

  return pose;
}

function getProceduralBaseMotionOption() {
  const option = getMotionModeOption(PROCEDURAL_BASE_MOTION_ID);
  return option.id === PROCEDURAL_BASE_MOTION_ID && option.url ? option : null;
}

async function sampleMotionFirstFramePose(option) {
  const motionRoot = getActiveMotionRoot();
  if (!motionRoot || !hasModelPoseTarget()) {
    return {};
  }

  const clip = await loadVrmAnimationClip(option);
  const previousPose = getCurrentModelPose();
  const mixer = new THREE.AnimationMixer(motionRoot);
  const action = mixer.clipAction(clip);

  try {
    resetModelPose();
    action.reset();
    action.play();
    mixer.setTime(0);
    activeVrm?.update?.(0);
    motionRoot.updateMatrixWorld(true);
    return getCurrentModelPose();
  } finally {
    action.stop();
    mixer.stopAllAction();
    mixer.uncacheRoot(motionRoot);
    resetModelPose();
    applyModelPose(previousPose);
    activeVrm?.update?.(0);
  }
}

async function loadProceduralBasePose() {
  const option = getProceduralBaseMotionOption();
  const key = `${getActiveMotionRoot()?.uuid || "none"}:${option?.id || "rest"}`;

  if (motionController.proceduralBasePoseKey === key && motionController.proceduralBasePose) {
    return motionController.proceduralBasePose;
  }

  if (motionController.proceduralBasePoseKey === key && motionController.proceduralBasePosePromise) {
    return motionController.proceduralBasePosePromise;
  }

  motionController.proceduralBasePoseKey = key;
  const basePosePromise = option
    ? sampleMotionFirstFramePose(option)
    : Promise.resolve({});
  motionController.proceduralBasePosePromise = basePosePromise;

  try {
    const basePose = await basePosePromise;
    if (motionController.proceduralBasePoseKey === key) {
      motionController.proceduralBasePose = basePose;
    }
    return basePose;
  } finally {
    if (motionController.proceduralBasePosePromise === basePosePromise) {
      motionController.proceduralBasePosePromise = null;
    }
  }
}

function ensurePoseTransform(pose, boneName) {
  if (!pose[boneName]) {
    pose[boneName] = {};
  }

  return pose[boneName];
}

function addPosePositionDelta(pose, boneName, x = 0, y = 0, z = 0) {
  const transform = ensurePoseTransform(pose, boneName);
  const position = transform.position || [0, 0, 0];
  transform.position = [
    position[0] + x,
    position[1] + y,
    position[2] + z
  ];
}

function addPoseRotationDelta(pose, boneName, x = 0, y = 0, z = 0) {
  const transform = ensurePoseTransform(pose, boneName);
  const rotation = new THREE.Quaternion();

  if (Array.isArray(transform.rotation)) {
    rotation.fromArray(transform.rotation);
  }

  rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, "XYZ")));
  transform.rotation = rotation.toArray();
}

function addRelaxedFingerCurl(pose, side) {
  const fingers = ["Index", "Middle", "Ring", "Little"];
  const sideDirection = side === "left" ? 1 : -1;

  addPoseRotationDelta(
    pose,
    `${side}ThumbMetacarpal`,
    THREE.MathUtils.degToRad(3),
    THREE.MathUtils.degToRad(4 * sideDirection),
    THREE.MathUtils.degToRad(-4 * sideDirection)
  );
  addPoseRotationDelta(pose, `${side}ThumbProximal`, THREE.MathUtils.degToRad(5), 0, 0);
  addPoseRotationDelta(pose, `${side}ThumbDistal`, THREE.MathUtils.degToRad(3), 0, 0);

  fingers.forEach((finger, index) => {
    const curl = finger === "Middle" || finger === "Ring" ? 0.68 : 0.54;
    const spread = (index - 1.5) * 1 * sideDirection;

    addPoseRotationDelta(
      pose,
      `${side}${finger}Proximal`,
      THREE.MathUtils.degToRad(8 * curl),
      THREE.MathUtils.degToRad(spread),
      0
    );
    addPoseRotationDelta(
      pose,
      `${side}${finger}Intermediate`,
      THREE.MathUtils.degToRad(10 * curl),
      0,
      0
    );
    addPoseRotationDelta(
      pose,
      `${side}${finger}Distal`,
      THREE.MathUtils.degToRad(5 * curl),
      0,
      0
    );
  });
}

function getLoopSine(t, duration) {
  const phase = ((t % duration) + duration) % duration;
  return Math.sin((phase / duration) * Math.PI * 2);
}

function getLoopPhase(t, duration) {
  return (((t % duration) + duration) % duration) / duration;
}

function easeInOutUnit(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function sampleLoopKeyframes(t, duration, keyframes) {
  const phase = getLoopPhase(t, duration);
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const current = keyframes[index];
    const next = keyframes[index + 1];
    if (phase >= current.at && phase <= next.at) {
      const span = next.at - current.at || 1;
      return THREE.MathUtils.lerp(
        current.value,
        next.value,
        easeInOutUnit((phase - current.at) / span)
      );
    }
  }

  return keyframes[keyframes.length - 1]?.value || 0;
}

function getCasualLookAroundGaze(t) {
  return sampleLoopKeyframes(t, CASUAL_LOOK_AROUND_LOOP_SECONDS, [
    { at: 0, value: 0 },
    { at: 0.12, value: 0 },
    { at: 0.24, value: -1 },
    { at: 0.36, value: -1 },
    { at: 0.5, value: 0 },
    { at: 0.62, value: 1 },
    { at: 0.76, value: 1 },
    { at: 0.9, value: 0 },
    { at: 1, value: 0 }
  ]);
}

function advanceLoopTime(t, delta, duration) {
  if (delta <= 0) {
    return t;
  }

  const nextTime = t + delta;
  return nextTime >= duration ? 0 : nextTime;
}

function buildBreathePose(basePose, t) {
  const pose = cloneNormalizedPose(basePose);
  const breath = 0.5 * getLoopSine(t, BREATHE_LOOP_SECONDS);
  const armBreath = breath * 0.5;
  const torsoLift = breath;
  const clavicleRoll = armBreath;
  const armDrift = 0.18 * armBreath;
  const armSettle = 1 - Math.abs(armBreath) * 0.08;

  addPosePositionDelta(pose, "hips", 0, -0.002 * torsoLift, 0);
  addPosePositionDelta(pose, "upperChest", 0, 0.006 * torsoLift, 0.002 * breath);
  addPosePositionDelta(pose, "neck", 0, 0.0015 * torsoLift, 0);
  addPosePositionDelta(pose, "head", 0, 0.002 * torsoLift, 0);
  addPosePositionDelta(pose, "leftShoulder", 0, 0.002 * torsoLift, 0);
  addPosePositionDelta(pose, "rightShoulder", 0, 0.002 * torsoLift, 0);

  addPoseRotationDelta(pose, "spine", THREE.MathUtils.degToRad(-0.3 * breath), 0, 0);
  addPoseRotationDelta(pose, "chest", THREE.MathUtils.degToRad(-0.8 * breath), 0, 0);
  addPoseRotationDelta(pose, "upperChest", THREE.MathUtils.degToRad(-2.2 * breath), 0, 0);
  addPoseRotationDelta(pose, "neck", THREE.MathUtils.degToRad(0.3 * breath), 0, 0);
  addPoseRotationDelta(pose, "head", THREE.MathUtils.degToRad(0.15 * breath), 0, 0);
  addPoseRotationDelta(
    pose,
    "leftShoulder",
    0,
    THREE.MathUtils.degToRad(-0.25 * armDrift),
    THREE.MathUtils.degToRad(0.8 * clavicleRoll)
  );
  addPoseRotationDelta(
    pose,
    "rightShoulder",
    0,
    THREE.MathUtils.degToRad(0.25 * armDrift),
    THREE.MathUtils.degToRad(-0.8 * clavicleRoll)
  );
  addPoseRotationDelta(
    pose,
    "leftUpperArm",
    THREE.MathUtils.degToRad(-2.5 + 0.4 * armBreath),
    THREE.MathUtils.degToRad(-2 - 0.5 * armDrift),
    THREE.MathUtils.degToRad(64 * armSettle - 0.35 * armDrift)
  );
  addPoseRotationDelta(
    pose,
    "rightUpperArm",
    THREE.MathUtils.degToRad(-2.5 + 0.4 * armBreath),
    THREE.MathUtils.degToRad(2 + 0.5 * armDrift),
    THREE.MathUtils.degToRad(-64 * armSettle + 0.35 * armDrift)
  );
  addPoseRotationDelta(
    pose,
    "leftLowerArm",
    THREE.MathUtils.degToRad(3 + 0.4 * armBreath),
    0,
    THREE.MathUtils.degToRad(8)
  );
  addPoseRotationDelta(
    pose,
    "rightLowerArm",
    THREE.MathUtils.degToRad(3 + 0.4 * armBreath),
    0,
    THREE.MathUtils.degToRad(-8)
  );
  addPoseRotationDelta(pose, "leftHand", THREE.MathUtils.degToRad(2), 0, THREE.MathUtils.degToRad(4));
  addPoseRotationDelta(pose, "rightHand", THREE.MathUtils.degToRad(2), 0, THREE.MathUtils.degToRad(-4));
  addRelaxedFingerCurl(pose, "left");
  addRelaxedFingerCurl(pose, "right");

  return pose;
}

function buildCasualLookAroundPose(basePose, t) {
  const pose = buildBreathePose(basePose, t);
  const gaze = getCasualLookAroundGaze(t);
  const glanceStrength = Math.abs(gaze);

  addPoseRotationDelta(pose, "upperChest", 0, THREE.MathUtils.degToRad(2.2 * gaze), 0);
  addPoseRotationDelta(
    pose,
    "neck",
    THREE.MathUtils.degToRad(-0.45 * glanceStrength),
    THREE.MathUtils.degToRad(7 * gaze),
    THREE.MathUtils.degToRad(-1.1 * gaze)
  );
  addPoseRotationDelta(
    pose,
    "head",
    THREE.MathUtils.degToRad(-0.65 * glanceStrength),
    THREE.MathUtils.degToRad(14 * gaze),
    THREE.MathUtils.degToRad(-1.8 * gaze)
  );

  return pose;
}

function buildProceduralPose(mode, t, basePose = {}) {
  if (mode === IDLE_BREATHE_MOTION_ID) {
    return buildBreathePose(basePose, t);
  }

  if (mode === CASUAL_LOOK_AROUND_MOTION_ID) {
    return buildCasualLookAroundPose(basePose, t);
  }

  return cloneNormalizedPose(basePose);
}

function getProceduralMotionLoopSeconds(mode) {
  return mode === CASUAL_LOOK_AROUND_MOTION_ID
    ? CASUAL_LOOK_AROUND_LOOP_SECONDS
    : BREATHE_LOOP_SECONDS;
}

function clearPoseTransition() {
  motionController.poseTransition = null;
}

function startPoseTransition(fromPose, toPose, options = {}) {
  motionController.poseTransition = createPoseTransition(fromPose, toPose, options);
  applyModelPose(samplePoseTransition(motionController.poseTransition, 0));
}

function updatePoseTransition(delta) {
  const transition = motionController.poseTransition;
  if (!transition) {
    return false;
  }

  transition.elapsed += Math.max(0, delta);
  applyModelPose(samplePoseTransition(transition, transition.elapsed));

  if (transition.elapsed < transition.duration) {
    motionController.status = "transitioning";
    motionController.error = "";
    return true;
  }

  const onComplete = transition.onComplete;
  clearPoseTransition();
  motionController.status = "playing";
  motionController.error = "";
  onComplete?.();
  return true;
}

function stopIdleInterlude() {
  if (
    motionController.idleInterludeMixer &&
    motionController.idleInterludeFinishHandler
  ) {
    motionController.idleInterludeMixer.removeEventListener(
      "finished",
      motionController.idleInterludeFinishHandler
    );
  }

  motionController.idleInterludeAction?.stop();

  const motionRoot = getActiveMotionRoot();
  if (motionController.idleInterludeMixer && motionRoot) {
    motionController.idleInterludeMixer.stopAllAction();
    motionController.idleInterludeMixer.uncacheRoot(motionRoot);
  }

  motionController.idleInterludeMixer = null;
  motionController.idleInterludeAction = null;
  motionController.idleInterludeFinishHandler = null;
  motionController.idleInterludeMotionId = "";
  motionController.idleInterludeTime = 0;
}

function stopLoadedMotionPlayback() {
  if (motionController.mixer && motionController.finishHandler) {
    motionController.mixer.removeEventListener("finished", motionController.finishHandler);
  }

  if (motionController.action) {
    motionController.action.stop();
    motionController.action = null;
  }

  const motionRoot = getActiveMotionRoot();
  if (motionController.mixer && motionRoot) {
    motionController.mixer.stopAllAction();
    motionController.mixer.uncacheRoot(motionRoot);
  }

  motionController.mixer = null;
  motionController.finishHandler = null;
  motionController.clip = null;
}

function holdPoseForTransition(pose) {
  stopLoadedMotionPlayback();
  stopIdleInterlude();
  applyModelPose(pose);
}

function prepareMotionChangeForTransition(fromPose, targetOption) {
  motionController.loadingId = null;
  motionController.idleInterludeLoadingId = null;
  clearPoseTransition();
  stopLoadedMotionPlayback();
  stopIdleInterlude();
  resetIdleInterludeSchedule({ startup: targetOption?.id === IDLE_BREATHE_MOTION_ID });
  motionController.proceduralTime = 0;
  motionController.proceduralBasePose = null;
  motionController.proceduralBasePoseKey = "";
  motionController.proceduralBasePosePromise = null;
  applyModelPose(fromPose);
}

function startLoopingModelClip(clip) {
  const motionRoot = getActiveMotionRoot();
  if (!motionRoot) {
    return;
  }

  const shouldLoop = clip.userData?.soulEchoAnimation?.loopAnalysis?.shouldLoop !== false;
  activeVrm?.humanoid?.resetNormalizedPose?.();
  motionController.mixer = new THREE.AnimationMixer(motionRoot);
  motionController.clip = clip;
  motionController.action = motionController.mixer.clipAction(clip);
  motionController.action.reset();
  motionController.action.setLoop(
    shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce,
    shouldLoop ? Infinity : 1
  );
  motionController.action.clampWhenFinished = !shouldLoop;
  if (!shouldLoop) {
    motionController.finishHandler = (event) => {
      if (event.action !== motionController.action) {
        return;
      }

      motionController.status = "finished";
      motionController.error = "";
      updateLocalModelDebug();
      updateModelAssetStatus();
    };
    motionController.mixer.addEventListener("finished", motionController.finishHandler);
  }
  motionController.action.play();
  motionController.status = "playing";
  motionController.error = "";
}

function startIdleInterludeClip(clip) {
  const motionRoot = getActiveMotionRoot();
  if (!motionRoot) {
    return;
  }

  const mixer = new THREE.AnimationMixer(motionRoot);
  const action = mixer.clipAction(clip);
  const finishHandler = (event) => {
    if (event.action === action) {
      finishIdleInterlude();
    }
  };

  mixer.addEventListener("finished", finishHandler);
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  motionController.idleInterludeMixer = mixer;
  motionController.idleInterludeAction = action;
  motionController.idleInterludeFinishHandler = finishHandler;
  motionController.status = "playing";
  motionController.error = "";
  updateLocalModelDebug();
  updateModelAssetStatus();
}

function applyCurrentProceduralPose() {
  if (!hasModelPoseTarget() || !motionController.proceduralBasePose) {
    return;
  }

  applyModelPose(
    buildProceduralPose(
      modelPreviewOptions.motion,
      motionController.proceduralTime,
      motionController.proceduralBasePose
    )
  );
}

function finishIdleInterlude() {
  const fromPose = getCurrentModelPose();
  stopIdleInterlude();
  motionController.proceduralTime = 0;
  resetIdleInterludeSchedule({ startup: false });
  const targetPose = buildProceduralPose(
    modelPreviewOptions.motion,
    motionController.proceduralTime,
    motionController.proceduralBasePose
  );
  startPoseTransition(fromPose, targetPose, {
    targetId: modelPreviewOptions.motion,
    targetLabel: getMotionModeLabel(modelPreviewOptions.motion),
    phase: "idle-interlude-out",
    onComplete: () => {
      applyCurrentProceduralPose();
      updateLocalModelDebug();
      updateModelAssetStatus();
    }
  });
  updateLocalModelDebug();
  updateModelAssetStatus();
}

function startIdleInterlude() {
  const interludeOption = getIdleInterludeOption();

  if (
    !interludeOption ||
    !motionController.proceduralBasePose ||
    modelPreviewOptions.motion !== IDLE_BREATHE_MOTION_ID ||
    motionController.poseTransition ||
    motionController.idleInterludeMotionId ||
    motionController.idleInterludeAction ||
    motionController.idleInterludeLoadingId
  ) {
    return;
  }

  motionController.idleInterludeStartupPending = false;
  const fromPose = getCurrentModelPose();
  const targetPose = buildProceduralPose(
    interludeOption.id,
    0,
    motionController.proceduralBasePose
  );
  holdPoseForTransition(fromPose);
  motionController.idleInterludeMotionId = interludeOption.id;
  motionController.idleInterludeTime = 0;
  motionController.proceduralTime = 0;
  startPoseTransition(fromPose, targetPose, {
    targetId: interludeOption.id,
    targetLabel: interludeOption.label,
    phase: "idle-interlude-in",
    onComplete: () => {
      motionController.idleInterludeMotionId = interludeOption.id;
      motionController.idleInterludeTime = 0;
      updateLocalModelDebug();
      updateModelAssetStatus();
    }
  });
  updateLocalModelDebug();
  updateModelAssetStatus();
}

function updateIdleInterlude(delta) {
  if (motionController.idleInterludeMixer && motionController.idleInterludeAction) {
    motionController.idleInterludeMixer.update(delta);
    return true;
  }

  if (!motionController.idleInterludeMotionId) {
    return false;
  }

  motionController.idleInterludeTime += Math.max(0, delta);
  if (motionController.idleInterludeTime >= CASUAL_LOOK_AROUND_LOOP_SECONDS) {
    finishIdleInterlude();
    return true;
  }

  applyModelPose(
    buildProceduralPose(
      motionController.idleInterludeMotionId,
      motionController.idleInterludeTime,
      motionController.proceduralBasePose
    )
  );
  return true;
}

function updateIdleInterludeSchedule(delta) {
  if (
    delta <= 0 ||
    modelPreviewOptions.motion !== IDLE_BREATHE_MOTION_ID ||
    motionController.poseTransition ||
    motionController.idleInterludeMotionId ||
    motionController.idleInterludeAction ||
    motionController.idleInterludeLoadingId ||
    !getIdleInterludeOption()
  ) {
    return;
  }

  motionController.idleInterludeClock += delta;
  if (motionController.idleInterludeClock < motionController.idleInterludeNextAt) {
    return;
  }

  if (motionController.idleInterludeStartupPending) {
    motionController.idleInterludeStartupPending = false;
    updateLocalModelDebug();
    updateModelAssetStatus();
  }
  if (Math.random() > getIdleRandomTickProbability(delta)) {
    return;
  }

  startIdleInterlude();
}

function applyProceduralModelMotion(delta) {
  const option = getMotionModeOption(modelPreviewOptions.motion);
  if (!hasModelPoseTarget() || !isProceduralMotionOption(option)) {
    return false;
  }

  if (!motionController.proceduralBasePose) {
    return true;
  }

  if (updateIdleInterlude(delta)) {
    motionController.status = "playing";
    motionController.error = "";
    return true;
  }

  updateIdleInterludeSchedule(delta);
  motionController.proceduralTime = advanceLoopTime(
    motionController.proceduralTime,
    delta,
    getProceduralMotionLoopSeconds(modelPreviewOptions.motion)
  );
  applyCurrentProceduralPose();
  motionController.status = "playing";
  motionController.error = "";
  return true;
}

async function applyLoadedModelMotion() {
  const option = getMotionModeOption(modelPreviewOptions.motion);
  const fromPose = getCurrentModelPose();

  if (!hasModelPoseTarget()) {
    resetLoadedModelMotion();
    refreshModelPreview();
    return;
  }

  prepareMotionChangeForTransition(fromPose, option);

  if (isProceduralMotionOption(option)) {
    motionController.status = "loading";
    motionController.error = "";
    const loadingId = `${option.id}:${performance.now()}`;
    motionController.loadingId = loadingId;
    updateLocalModelDebug();
    updateModelAssetStatus();

    try {
      const basePose = await loadProceduralBasePose();
      if (motionController.loadingId !== loadingId || modelPreviewOptions.motion !== option.id) {
        return;
      }

      motionController.proceduralBasePose = basePose;
      const targetPose = buildProceduralPose(option.id, 0, basePose);
      startPoseTransition(fromPose, targetPose, {
        targetId: option.id,
        targetLabel: option.label,
        phase: "transitioning",
        onComplete: () => {
          motionController.proceduralTime = 0;
          applyCurrentProceduralPose();
          motionController.status = "playing";
          motionController.error = "";
          updateLocalModelDebug();
          updateModelAssetStatus();
        }
      });
    } catch (error) {
      if (motionController.loadingId !== loadingId) {
        return;
      }
      motionController.status = "error";
      motionController.error = error instanceof Error ? error.message : "Procedural base pose failed to load";
      console.warn(motionController.error);
      modelPreviewOptions.motion = STILL_MOTION_ID;
      setPreviewUrlParam("motion", STILL_MOTION_ID);
      resetLoadedModelMotion();
    } finally {
      if (motionController.loadingId === loadingId) {
        motionController.loadingId = null;
      }
      refreshModelPreview();
    }
    return;
  }

  if (option.id === STILL_MOTION_ID || !getActiveMotionRoot()) {
    startPoseTransition(fromPose, getRestModelPose(), {
      targetId: STILL_MOTION_ID,
      targetLabel: STILL_MOTION_OPTION.label,
      phase: "transitioning",
      onComplete: () => {
        resetModelPose();
        motionController.status = "idle";
        motionController.error = "";
        updateLocalModelDebug();
        updateModelAssetStatus();
      }
    });
    refreshModelPreview();
    return;
  }

  motionController.status = "loading";
  motionController.error = "";
  const loadingId = `${option.id}:${performance.now()}`;
  motionController.loadingId = loadingId;
  updateLocalModelDebug();
  updateModelAssetStatus();

  try {
    const clip = await loadVrmAnimationClip(option);
    if (motionController.loadingId !== loadingId || modelPreviewOptions.motion !== option.id) {
      return;
    }

    const targetPose = await sampleMotionFirstFramePose(option);
    if (motionController.loadingId !== loadingId || modelPreviewOptions.motion !== option.id) {
      return;
    }

    startPoseTransition(fromPose, targetPose, {
      targetId: option.id,
      targetLabel: option.label,
      phase: "transitioning",
      onComplete: () => {
        startLoopingModelClip(clip);
        updateLocalModelDebug();
        updateModelAssetStatus();
      }
    });
  } catch (error) {
    if (motionController.loadingId !== loadingId) {
      return;
    }
    motionController.status = "error";
    motionController.error = error instanceof Error ? error.message : "Motion failed to load";
    console.warn(motionController.error);
    modelPreviewOptions.motion = STILL_MOTION_ID;
    setPreviewUrlParam("motion", STILL_MOTION_ID);
    resetLoadedModelMotion();
  } finally {
    if (motionController.loadingId === loadingId) {
      motionController.loadingId = null;
    }
    refreshModelPreview();
  }
}

function updateLoadedModelMotion(delta) {
  if (updatePoseTransition(delta)) {
    return;
  }

  if (applyProceduralModelMotion(delta)) {
    return;
  }
  motionController.mixer?.update(delta);
}

function animateStage(t) {
  stage.children.forEach((child, index) => {
    if (child.geometry?.type === "TorusGeometry") {
      child.rotation.z += 0.0015 * (index % 2 ? -1 : 1);
    }
  });
  stage.rotation.y = Math.sin(t * 0.18) * 0.025;
}

function updateCamera() {
  const cameraZoom = THREE.MathUtils.clamp(
    modelPreviewOptions.cameraZoom,
    CAMERA_ZOOM_MIN,
    CAMERA_ZOOM_MAX
  );
  const preset = CAMERA_ANGLE_PRESETS[cameraMode] || CAMERA_ANGLE_PRESETS[0];
  const radius = (realDancer ? preset.radius : preset.fallbackRadius) * cameraZoom;
  const yaw = preset.yaw + drag.yaw;
  const pitch = THREE.MathUtils.clamp(
    preset.pitch + drag.pitch,
    realDancer ? -0.08 : 0.02,
    realDancer ? 0.76 : 0.88
  );
  const targetY = preset.targetY;

  camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * radius,
    targetY + Math.sin(pitch) * radius,
    Math.cos(yaw) * Math.cos(pitch) * radius
  );
  orbitTarget.set(0, targetY, 0);
  camera.lookAt(orbitTarget);
  camera.rotation.z = preset.roll || 0;

  if (window.localModelDebug) {
    window.localModelDebug.camera = {
      mode: preset.label,
      yaw,
      pitch,
      position: camera.position.toArray(),
      target: orbitTarget.toArray()
    };
  }
}

function parseUnitInterval(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  const normalized = String(value).toLowerCase();
  if (["true", "yes", "on"].includes(normalized)) {
    return 1;
  }
  if (["false", "no", "off"].includes(normalized)) {
    return 0;
  }

  const amount = Number(value);
  return Number.isFinite(amount)
    ? THREE.MathUtils.clamp(amount, 0, 1)
    : fallback;
}

function parseClampedNumber(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, min, max) : fallback;
}

function pickChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback;
}

function pickFirstChoice(values, choices, fallback) {
  return values.find((value) => choices.includes(value)) || fallback;
}

function normalizeDemoConfigurationName(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "default";
}

function isDemoMode() {
  return appMode === "demo";
}

async function saveDemoProfile(configurationName = demoConfigurationName) {
  demoConfigurationName = normalizeDemoConfigurationName(configurationName);
  const selectedPreset = localAssetState?.selectedModelPreset || null;
  const selectedFaceModel = faceModelController.options.find(
    (option) => option.id === faceModelController.selectedId
  );
  const selectedMotion = getMotionModeOption(modelPreviewOptions.motion);
  const requiredMotion = selectedMotion?.kind === "vrma"
    ? selectedMotion
    : isProceduralMotionOption(selectedMotion)
      ? getProceduralBaseMotionOption()
      : null;
  const motionPresets = requiredMotion?.path
    ? [{
        id: requiredMotion.id,
        label: requiredMotion.label,
        path: requiredMotion.path,
        kind: requiredMotion.kind,
        required: true
      }]
    : [];
  const profile = {
    configuration: demoConfigurationName,
    savedAt: new Date().toISOString(),
    assetRoot: selectedPreset?.assetRoot ||
      localAssetState?.config?.assetRoot ||
      "/local-resources/original-video-assets/",
    modelPreset: selectedPreset?.id || queryParams.get(PREVIEW_QUERY_KEYS.modelPreset) || "",
    modelPresetLabel: selectedPreset?.label || "Configured model",
    modelPresetAsset: selectedPreset
      ? {
          id: selectedPreset.id,
          label: selectedPreset.label,
          path: selectedPreset.path,
          kind: selectedPreset.kind || getModelKind(selectedPreset),
          required: true
        }
      : null,
    faceModel: selectedFaceModel?.id || faceModelController.selectedId || "",
    faceModelLabel: selectedFaceModel?.label || "Configured face model",
    modelPreview: { ...modelPreviewOptions },
    motionPresets
  };

  try {
    const response = await fetch(appUrl("demo-profile"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Save returned ${response.status}`);
    }
    const savedPath = body.path || "public/demo-profile.json";
    addDialogueLine("system", `compiled ${demoConfigurationName}: ${profile.modelPresetLabel}`);
    addDialogueLine("system", `saved ${savedPath}`);
    showSpeechPhrase("Demo profile compiled.");
  } catch (error) {
    addDialogueLine(
      "system",
      `demo profile save failed: ${error instanceof Error ? error.message : "compile failed"}`
    );
    showSpeechPhrase("Demo profile could not be saved.");
  }
  return profile;
}

function replaceUrlFromQueryParams() {
  const search = queryParams.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`
  );
}

function initializeAppMode() {
  document.documentElement.dataset.appMode = appMode;
  document.documentElement.dataset.demoConfiguration = demoConfigurationName;
}

function openProfileSaveDialog() {
  profileSaveNameInput.value = demoConfigurationName;
  profileSaveNameInput.setSelectionRange(0, profileSaveNameInput.value.length);

  if (typeof profileSaveDialog.showModal === "function") {
    profileSaveDialog.showModal();
    profileSaveNameInput.focus();
    return;
  }

  const promptedName = window.prompt("Demo profile name", demoConfigurationName);
  if (promptedName !== null) {
    saveDemoProfile(promptedName);
  }
}

function closeProfileSaveDialog() {
  if (profileSaveDialog.open) {
    profileSaveDialog.close();
  }
}

function getModelPreviewOptions(sceneConfig) {
  const configured = sceneConfig?.modelPreview || {};
  const mode = pickChoice(
    queryParams.get("modelMode") ||
      configured.mode ||
      configured.modelMode,
    MODEL_MODE_CHOICES,
    DEFAULT_MODEL_PREVIEW_OPTIONS.mode
  );
  const lighting = pickChoice(
    queryParams.get("modelLighting") || configured.lighting,
    MODEL_LIGHTING_CHOICES,
    DEFAULT_MODEL_PREVIEW_OPTIONS.lighting
  );
  const motion = pickMotionChoice(
    pickFirstChoice(
      [
        queryParams.get("modelMotion"),
        configured.motion,
        configured.modelMotion
      ],
      getMotionModeChoices(),
      STILL_MOTION_ID
    )
  );
  const stageLighting = parseUnitInterval(
    queryParams.get("stageLighting") ?? configured.stageLighting,
    DEFAULT_MODEL_PREVIEW_OPTIONS.stageLighting
  );
  const materialBoostStrength = Number(
    queryParams.get("materialBoostStrength") ??
      configured.materialBoostStrength ??
      DEFAULT_MODEL_PREVIEW_OPTIONS.materialBoostStrength
  );
  const saturation = parseClampedNumber(
    queryParams.get("modelSaturation") ?? configured.saturation,
    DEFAULT_MODEL_PREVIEW_OPTIONS.saturation,
    0,
    2
  );
  const bloomStrength = parseClampedNumber(
    queryParams.get("modelBloom") ?? configured.bloomStrength,
    DEFAULT_MODEL_PREVIEW_OPTIONS.bloomStrength,
    0,
    0.6
  );
  const cameraZoom = parseClampedNumber(
    queryParams.get("cameraZoom") ?? configured.cameraZoom,
    DEFAULT_MODEL_PREVIEW_OPTIONS.cameraZoom,
    CAMERA_ZOOM_MIN,
    CAMERA_ZOOM_MAX
  );
  const readingWpm = Math.round(parseClampedNumber(
    queryParams.get("readingWpm") ?? configured.readingWpm,
    DEFAULT_MODEL_PREVIEW_OPTIONS.readingWpm,
    READING_WPM_MIN,
    READING_WPM_MAX
  ));

  return {
    mode,
    lighting,
    motion,
    stageLighting,
    materialBoostStrength: Number.isFinite(materialBoostStrength)
      ? THREE.MathUtils.clamp(materialBoostStrength, 0, 1)
      : DEFAULT_MODEL_PREVIEW_OPTIONS.materialBoostStrength,
    saturation,
    bloomStrength,
    cameraZoom,
    readingWpm
  };
}

function randomBlinkDelay() {
  return THREE.MathUtils.randFloat(2.6, 6.4);
}

function randomBlinkDuration() {
  return THREE.MathUtils.randFloat(0.12, 0.18);
}

function smoothStep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function isEyeMorphName(name) {
  return /目|瞳|眼|まばたき|ウィンク|笑い|びっくり|はぅ|なごみ|じと|ハート|星|eye|eyes|blink|wink|iris|pupil|star|cross/i.test(
    name
  );
}

function isOneSidedEyeMorphName(name) {
  return /(^|[_\-\s.])(l|r|left|right)([_\-\s.]|$)|(left|right)$|左|右/i.test(name);
}

function isOutfitMorphName(name) {
  return /shirt|dress|cloth|clothes|skirt|bikini|ribbon|outfit|costume|服|衣|裙/i.test(name);
}

function formatMorphLabel(name) {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function morphAttributeHasDelta(attribute) {
  if (!attribute?.array) {
    return false;
  }

  return attribute.array.some((value) => Math.abs(value) > 0.000001);
}

function morphTargetHasGeometryDelta(object, index) {
  const morphAttributes = object.geometry?.morphAttributes;
  if (!morphAttributes) {
    return false;
  }

  return ["position", "normal", "color"].some((attributeName) =>
    morphAttributeHasDelta(morphAttributes[attributeName]?.[index])
  );
}

function collectVrmEyeExpressionOptions(vrm) {
  const expressionMap = vrm?.expressionManager?.expressionMap;
  if (!expressionMap) {
    return [];
  }

  return [...VRM_BOTH_EYE_EXPRESSION_LABELS.entries()]
    .filter(([expressionName]) => expressionMap[expressionName])
    .map(([expressionName, label], index) => ({
      id: `eye-expression-${index}`,
      name: label,
      expressionName
    }));
}

function hasExpressionBinds(expression) {
  return (expression?.binds?.length || 0) > 0;
}

function collectVrmFaceEmoteOptions(vrm) {
  const expressionMap = vrm?.expressionManager?.expressionMap;
  if (!expressionMap) {
    return [];
  }

  return [...VRM_FACE_EXPRESSION_LABELS.entries()]
    .filter(([expressionName]) => hasExpressionBinds(expressionMap[expressionName]))
    .map(([expressionName, label], index) => ({
      id: `face-expression-${index}`,
      name: label,
      expressionName
    }));
}

function collectRawEyeMorphOptions(mesh, { bilateralOnly = false, excludeNames = new Set() } = {}) {
  const options = new Map();

  mesh.traverse((object) => {
    if (!object.morphTargetDictionary || !object.morphTargetInfluences) {
      return;
    }

    Object.entries(object.morphTargetDictionary).forEach(([name, index]) => {
      if (
        !isEyeMorphName(name) ||
        excludeNames.has(name) ||
        (bilateralOnly && isOneSidedEyeMorphName(name)) ||
        !morphTargetHasGeometryDelta(object, index)
      ) {
        return;
      }

      if (!options.has(name)) {
        options.set(name, {
          id: `eye-${options.size}`,
          name,
          targets: []
        });
      }

      options.get(name).targets.push({ object, index });
    });
  });

  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function collectEyeMorphOptions(mesh, vrm = null) {
  const vrmOptions = collectVrmEyeExpressionOptions(vrm);
  if (vrmOptions.length === 0) {
    return collectRawEyeMorphOptions(mesh);
  }

  const rawBilateralOptions = collectRawEyeMorphOptions(mesh, {
    bilateralOnly: true,
    excludeNames: VRM_EXPRESSION_BACKED_RAW_EYE_MORPHS
  });

  return [...vrmOptions, ...rawBilateralOptions];
}

function collectOutfitMorphOptions(mesh) {
  const options = new Map();

  mesh.traverse((object) => {
    if (!object.morphTargetDictionary || !object.morphTargetInfluences) {
      return;
    }

    Object.entries(object.morphTargetDictionary).forEach(([name, index]) => {
      if (!isOutfitMorphName(name) || !morphTargetHasGeometryDelta(object, index)) {
        return;
      }

      if (!options.has(name)) {
        options.set(name, {
          id: `outfit-${options.size}`,
          name: formatMorphLabel(name),
          rawName: name,
          targets: []
        });
      }

      options.get(name).targets.push({ object, index });
    });
  });

  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function setVrmExpressionWeight(option, weight) {
  if (!option?.expressionName || !activeVrm?.expressionManager) {
    return false;
  }

  activeVrm.expressionManager.setValue(option.expressionName, weight);
  return true;
}

function populateModelPresetSelect(state) {
  const presets = state.modelPresets || [];
  const selected = state.selectedModelPreset || presets[0];
  const visiblePresets = presets.filter((preset) => preset.ok);

  modelPresetSelect.innerHTML = "";

  if (visiblePresets.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Configured model";
    modelPresetSelect.append(option);
    modelPresetSelect.disabled = true;
    return;
  }

  visiblePresets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    option.selected = preset.id === selected?.id;
    modelPresetSelect.append(option);
  });

  modelPresetSelect.disabled = visiblePresets.length <= 1;
  modelPresetSelect.title = selected
    ? `${selected.label}: ${selected.path || "No path configured"}`
    : "No model presets configured";
  document.documentElement.dataset.modelPreset = selected?.id || "";

  const requestedModelPreset = queryParams.get(PREVIEW_QUERY_KEYS.modelPreset);
  if (requestedModelPreset && selected?.id && requestedModelPreset !== selected.id) {
    setPreviewUrlParam("modelPreset", selected.id);
  }
}

function setEyeMorphWeight(option, weight) {
  if (setVrmExpressionWeight(option, weight)) {
    return;
  }

  option.targets.forEach((target) => {
    target.object.morphTargetInfluences[target.index] = weight;
  });
}

function applyEyeMorphSelection(id = eyeMorphController.selectedId) {
  eyeMorphController.selectedId = id;
  eyeMorphController.options.forEach((option) => {
    setEyeMorphWeight(option, option.id === id ? 1 : 0);
  });
  document.documentElement.dataset.eyeMorph = id;
  if (window.localModelDebug) {
    const selected = eyeMorphController.options.find((option) => option.id === id);
    window.localModelDebug.eyeMorph = selected?.name || "Default eyes";
  }
}

function setFaceEmoteWeight(option, weight) {
  setVrmExpressionWeight(option, weight);
}

function applyFaceEmoteSelection(id = faceEmoteController.selectedId) {
  faceEmoteController.selectedId = id;
  faceEmoteController.options.forEach((option) => {
    setFaceEmoteWeight(option, option.id === id ? 1 : 0);
  });
  document.documentElement.dataset.faceEmote = id;
  if (window.localModelDebug) {
    const selected = faceEmoteController.options.find((option) => option.id === id);
    window.localModelDebug.faceEmote = selected?.name || "Default face";
  }
}

function setOutfitMorphWeight(option, weight) {
  option.targets.forEach((target) => {
    target.object.morphTargetInfluences[target.index] = weight;
  });
}

function applyOutfitMorphSelection(id = outfitMorphController.selectedId) {
  outfitMorphController.selectedId = id;
  outfitMorphController.options.forEach((option) => {
    setOutfitMorphWeight(option, option.id === id ? 1 : 0);
  });
  document.documentElement.dataset.outfitMorph = id;
  if (window.localModelDebug) {
    const selected = outfitMorphController.options.find((option) => option.id === id);
    window.localModelDebug.outfitMorph = selected?.name || "Default outfit";
  }
}

function populateEyeMorphSelect(mesh, vrm = null) {
  eyeMorphController.options = collectEyeMorphOptions(mesh, vrm);
  eyeMorphController.selectedId = "default";

  eyeMorphSelect.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "default";
  defaultOption.textContent = "Default eyes";
  eyeMorphSelect.append(defaultOption);

  eyeMorphController.options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option.id;
    optionElement.textContent = option.name;
    eyeMorphSelect.append(optionElement);
  });

  eyeMorphSelect.disabled = eyeMorphController.options.length === 0;
  eyeMorphSelect.title = eyeMorphController.options.length
    ? `${eyeMorphController.options.length} eye morphs`
    : "No eye morphs found";
  document.documentElement.dataset.eyeMorphCount = String(eyeMorphController.options.length);
  applyEyeMorphSelection("default");
}

function populateFaceEmoteSelect(vrm = null) {
  faceEmoteController.options = collectVrmFaceEmoteOptions(vrm);
  faceEmoteController.selectedId = "default";

  faceEmoteSelect.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "default";
  defaultOption.textContent = "Default face";
  faceEmoteSelect.append(defaultOption);

  faceEmoteController.options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option.id;
    optionElement.textContent = option.name;
    faceEmoteSelect.append(optionElement);
  });

  faceEmoteSelect.disabled = faceEmoteController.options.length === 0;
  faceEmoteSelect.title = faceEmoteController.options.length
    ? `${faceEmoteController.options.length} face emotes`
    : "No face emotes found";
  document.documentElement.dataset.faceEmoteCount = String(faceEmoteController.options.length);
  applyFaceEmoteSelection("default");
}

function populateOutfitMorphSelect(mesh) {
  outfitMorphController.options = collectOutfitMorphOptions(mesh);
  outfitMorphController.selectedId = "default";

  outfitMorphSelect.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "default";
  defaultOption.textContent = "Default outfit";
  outfitMorphSelect.append(defaultOption);

  outfitMorphController.options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option.id;
    optionElement.textContent = option.name;
    outfitMorphSelect.append(optionElement);
  });

  outfitMorphSelect.disabled = outfitMorphController.options.length === 0;
  outfitMorphSelect.title = outfitMorphController.options.length
    ? `${outfitMorphController.options.length} outfit options`
    : "No outfit options found";
  document.documentElement.dataset.outfitMorphCount = String(outfitMorphController.options.length);
  applyOutfitMorphSelection("default");
}

function setBlinkWeight(weight) {
  blinkController.targets.forEach((target) => {
    if (target.expressionName && activeVrm?.expressionManager) {
      activeVrm.expressionManager.setValue(target.expressionName, weight);
      return;
    }

    target.object.morphTargetInfluences[target.index] = weight;
  });
  document.documentElement.dataset.blinkWeight = weight > 0.001 ? weight.toFixed(2) : "0";
  updateCompanionFaceBlink(weight);
}

function scheduleNextBlink(delay = randomBlinkDelay()) {
  blinkController.nextAt = blinkController.clock + delay;
}

function startBlink() {
  blinkController.active = true;
  blinkController.time = 0;
  blinkController.duration = randomBlinkDuration();
  blinkController.doubleBlinkQueued = Math.random() < 0.12;
}

function configureBlink(mesh, vrm = null) {
  const targets = [];
  const blinkExpression = vrm?.expressionManager?.expressionMap?.[VRM_BLINK_EXPRESSION_NAME];

  if (blinkExpression) {
    targets.push({
      name: VRM_BLINK_EXPRESSION_NAME,
      expressionName: VRM_BLINK_EXPRESSION_NAME
    });
  }

  if (targets.length === 0) {
    mesh.traverse((object) => {
      if (!object.morphTargetDictionary || !object.morphTargetInfluences) {
        return;
      }

      const morphName = BLINK_MORPH_NAMES.find(
        (name) => object.morphTargetDictionary[name] !== undefined
      );

      if (morphName) {
        targets.push({
          object,
          name: morphName,
          index: object.morphTargetDictionary[morphName]
        });
      }
    });
  }

  blinkController.targets = targets;
  blinkController.clock = 0;
  blinkController.active = false;
  blinkController.time = 0;
  blinkController.doubleBlinkQueued = false;
  scheduleNextBlink(THREE.MathUtils.randFloat(1.2, 3.2));
  document.documentElement.dataset.blinkMorphs = targets.map((target) => target.name).join(",");
  setBlinkWeight(0);

  return targets;
}

function updateBlink(delta) {
  if (blinkController.targets.length === 0) {
    return;
  }

  blinkController.clock += delta;

  if (!blinkController.active && blinkController.clock >= blinkController.nextAt) {
    startBlink();
  }

  if (!blinkController.active) {
    return;
  }

  blinkController.time += delta;

  const closeTime = blinkController.duration * BLINK_CLOSE_RATIO;
  const holdTime = blinkController.duration * BLINK_HOLD_RATIO;
  const openStart = closeTime + holdTime;
  const openTime = Math.max(blinkController.duration - openStart, 0.001);
  let weight = 0;

  if (blinkController.time < closeTime) {
    weight = smoothStep(blinkController.time / closeTime);
  } else if (blinkController.time < openStart) {
    weight = 1;
  } else if (blinkController.time < blinkController.duration) {
    weight = 1 - smoothStep((blinkController.time - openStart) / openTime);
  } else {
    blinkController.active = false;
    weight = 0;
    scheduleNextBlink(
      blinkController.doubleBlinkQueued
        ? THREE.MathUtils.randFloat(0.14, 0.28)
        : randomBlinkDelay()
    );
    blinkController.doubleBlinkQueued = false;
  }

  setBlinkWeight(weight);
}

function applyModelPreviewLighting() {
  const enhanced = modelPreviewOptions.lighting === "enhanced";
  const previewingModel = Boolean(realDancer);
  const stageLightingAmount = previewingModel ? modelPreviewOptions.stageLighting : 1;

  stageAmbientLight.intensity = 0.85 * stageLightingAmount;
  keyLight.intensity = 2.7 * stageLightingAmount;
  modelAmbientLight.intensity = enhanced ? 1.35 : 0.35;
  modelFillLight.intensity = enhanced ? 2.1 : 0.75;
  modelSideLight.intensity = enhanced ? 5 : 0.9;
  modelHairLight.intensity = enhanced ? 1.8 : 0.45;
  rimLight.intensity = enhanced ? 2.5 : 0.7;
  magentaLight.intensity = enhanced ? 1.2 : 0.25;
  saturationPass.uniforms.saturation.value = modelPreviewOptions.saturation;
  bloom.enabled = modelPreviewOptions.bloomStrength > 0;
  bloom.strength = modelPreviewOptions.bloomStrength;
}

function setPreviewOutput(name, value) {
  const output = previewValueOutputs.get(name);
  if (output) {
    output.value = value;
    output.textContent = value;
  }
}

function formatPreviewNumber(value) {
  return Number(value).toFixed(2);
}

function setPreviewUrlParam(option, value) {
  const key = PREVIEW_QUERY_KEYS[option];
  if (!key) {
    return;
  }

  const normalizedValue = option === "readingWpm"
    ? String(Math.round(Number(value)))
    : typeof value === "number"
      ? formatPreviewNumber(value)
      : String(value);
  queryParams.set(key, normalizedValue);
  replaceUrlFromQueryParams();
}

function pruneDeprecatedPreviewUrlParams() {
  let changed = false;
  DEPRECATED_PREVIEW_QUERY_KEYS.forEach((key) => {
    if (queryParams.has(key)) {
      queryParams.delete(key);
      changed = true;
    }
  });

  if (!changed) {
    return;
  }

  replaceUrlFromQueryParams();
}

function updatePreviewControls() {
  populateMotionModeSelect();
  const motionState = getMotionPlaybackState();

  const amount = THREE.MathUtils.clamp(modelPreviewOptions.stageLighting, 0, 1);
  const stageLabel = `Stage lighting ${Math.round(amount * 100)}%`;
  stageLightingSlider.value = amount.toFixed(2);
  stageLightingSlider.setAttribute("aria-valuetext", stageLabel);
  stageLightingSlider.title = stageLabel;
  setPreviewOutput("stageLighting", `${Math.round(amount * 100)}%`);

  modelBloomSlider.value = formatPreviewNumber(modelPreviewOptions.bloomStrength);
  modelBloomSlider.setAttribute(
    "aria-valuetext",
    `Bloom ${formatPreviewNumber(modelPreviewOptions.bloomStrength)}`
  );
  setPreviewOutput("modelBloom", formatPreviewNumber(modelPreviewOptions.bloomStrength));

  materialBoostStrengthSlider.value = formatPreviewNumber(modelPreviewOptions.materialBoostStrength);
  materialBoostStrengthSlider.setAttribute(
    "aria-valuetext",
    `Material boost ${formatPreviewNumber(modelPreviewOptions.materialBoostStrength)}`
  );
  setPreviewOutput(
    "materialBoostStrength",
    formatPreviewNumber(modelPreviewOptions.materialBoostStrength)
  );

  modelSaturationSlider.value = formatPreviewNumber(modelPreviewOptions.saturation);
  modelSaturationSlider.setAttribute(
    "aria-valuetext",
    `Color saturation ${formatPreviewNumber(modelPreviewOptions.saturation)}`
  );
  setPreviewOutput("modelSaturation", formatPreviewNumber(modelPreviewOptions.saturation));

  if (
    document.activeElement !== readingWpmInput &&
    readingWpmInput.dataset.valid !== "false"
  ) {
    readingWpmInput.value = String(modelPreviewOptions.readingWpm);
  }
  readingWpmInput.setAttribute("aria-valuetext", `${modelPreviewOptions.readingWpm} words per minute`);
  setPreviewOutput("readingWpm", String(modelPreviewOptions.readingWpm));

  motionModeSelect.value = modelPreviewOptions.motion;
  motionModeSelect.title = `Motion ${getMotionModeLabel(modelPreviewOptions.motion)}`;

  previewControls.dataset.stage = amount > 0 ? "active" : "";
  previewControls.dataset.boost = modelPreviewOptions.materialBoostStrength > 0 ? "active" : "";
  previewControls.dataset.saturation = modelPreviewOptions.saturation !== 1 ? "active" : "";
  previewControls.dataset.motion = modelPreviewOptions.motion !== "still" ? "active" : "";
  document.documentElement.dataset.stageLighting = amount.toFixed(2);
  document.documentElement.dataset.modelSaturation = formatPreviewNumber(
    modelPreviewOptions.saturation
  );
  document.documentElement.dataset.modelMotion = modelPreviewOptions.motion;
  document.documentElement.dataset.effectiveModelMotion = motionState.effectiveId;
  document.documentElement.dataset.modelMotionInterlude = motionState.interludeState;

  const requestedMotion = queryParams.get(PREVIEW_QUERY_KEYS.motion);
  if (
    motionController.configured &&
    requestedMotion &&
    requestedMotion !== modelPreviewOptions.motion &&
    !getMotionModeChoices().includes(requestedMotion)
  ) {
    setPreviewUrlParam("motion", modelPreviewOptions.motion);
  }

  previewOptionButtons.forEach((button) => {
    const group = button.dataset.optionGroup;
    const active = modelPreviewOptions[group] === button.dataset.optionValue;
    button.dataset.state = active ? "active" : "";
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function updateLocalModelDebug() {
  const alphaLayerStats = getMmdAlphaLayerStats();
  const motionState = getMotionPlaybackState();
  const loopAnalysis = motionController.clip?.userData?.soulEchoAnimation?.loopAnalysis;
  document.documentElement.dataset.pmxAlphaLayers = String(alphaLayerStats.active);
  document.documentElement.dataset.pmxAlphaCutouts = String(alphaLayerStats.cutouts);
  document.documentElement.dataset.effectiveModelMotion = motionState.effectiveId;
  document.documentElement.dataset.modelMotionInterlude = motionState.interludeState;
  document.documentElement.dataset.modelMotionLoopHint = loopAnalysis?.loopHint || "";
  document.documentElement.dataset.modelMotionShouldLoop =
    loopAnalysis ? String(loopAnalysis.shouldLoop) : "";

  if (!window.localModelDebug) {
    return;
  }

  const selectedEyeMorph = eyeMorphController.options.find(
    (option) => option.id === eyeMorphController.selectedId
  );
  const selectedFaceEmote = faceEmoteController.options.find(
    (option) => option.id === faceEmoteController.selectedId
  );
  const selectedOutfitMorph = outfitMorphController.options.find(
    (option) => option.id === outfitMorphController.selectedId
  );

  Object.assign(window.localModelDebug, {
    mode: modelPreviewOptions.mode,
    lighting: modelPreviewOptions.lighting,
    stageLighting: modelPreviewOptions.stageLighting,
    materialBoost: true,
    materialBoostStrength: modelPreviewOptions.materialBoostStrength,
    saturation: modelPreviewOptions.saturation,
    bloomStrength: modelPreviewOptions.bloomStrength,
    cameraZoom: modelPreviewOptions.cameraZoom,
    readingWpm: modelPreviewOptions.readingWpm,
    motion: modelPreviewOptions.motion,
    motionLabel: motionState.selectedLabel,
    effectiveMotion: motionState.effectiveId,
    effectiveMotionLabel: motionState.effectiveLabel,
    effectiveMotionStatus: motionState.effectiveStatus,
    motionOptions: motionController.options.map((option) => option.label),
    motionStatus: motionController.status,
    motionError: motionController.error,
    motionClipDuration: motionController.clip?.duration || 0,
    soulEchoAnimation: serializeSoulAnimationForDebug(
      motionController.clip?.userData?.soulEchoAnimation
    ),
    motionInterlude: motionState.interludeState,
    motionInterludeId: motionState.interludeId,
    motionInterludeLabel: motionState.interludeLabel,
    motionInterludeNextIn: motionState.interludeNextIn,
    modelPreset: localAssetState?.selectedModelPreset?.label || "Configured model",
    alphaLayers: alphaLayerStats,
    eyeMorph: selectedEyeMorph?.name || "Default eyes",
    faceEmote: selectedFaceEmote?.name || "Default face",
    outfitMorph: selectedOutfitMorph?.name || "Default outfit"
  });
}

function updateModelAssetStatus() {
  if (!realDancer) {
    return;
  }

  const motionSummary = getMotionStatusSummary();
  assetStatus.dataset.state = "ready";
  assetStatus.innerHTML = `
    <span>${getModelFormatLabel(activeModelKind)} model</span>
    <strong>${localAssetState?.selectedModelPreset?.label || (modelPreviewOptions.mode === "clay" ? "Clay" : "Textured")}</strong>
    <small>${modelPreviewOptions.mode === "clay" ? "clay" : "textured"} · ${modelPreviewOptions.lighting} · ${motionSummary} · boost ${formatPreviewNumber(modelPreviewOptions.materialBoostStrength)} · sat ${formatPreviewNumber(modelPreviewOptions.saturation)} · stage ${Math.round(modelPreviewOptions.stageLighting * 100)}% · bloom ${formatPreviewNumber(modelPreviewOptions.bloomStrength)} · zoom ${formatPreviewNumber(modelPreviewOptions.cameraZoom)} · ${modelPreviewOptions.readingWpm} wpm · ${countModelBones(realDancer)} bones</small>
  `;
}

function finishInitialLoad() {
  if (loadVeil) {
    loadVeil.dataset.state = "ready";
  }
}

function refreshModelPreview({ materials: refreshMaterials = false } = {}) {
  if (refreshMaterials && realDancer) {
    setModelMaterials(realDancer);
  }
  applyModelPreviewLighting();
  updatePreviewControls();
  updateLocalModelDebug();
  updateModelAssetStatus();
}

function setStageLighting(value, syncUrl = true) {
  modelPreviewOptions.stageLighting = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
  if (syncUrl) {
    setPreviewUrlParam("stageLighting", modelPreviewOptions.stageLighting);
  }
  refreshModelPreview();
}

function setBloomStrength(value, syncUrl = true) {
  modelPreviewOptions.bloomStrength = parseClampedNumber(value, 0, 0, 0.6);
  if (syncUrl) {
    setPreviewUrlParam("bloomStrength", modelPreviewOptions.bloomStrength);
  }
  refreshModelPreview();
}

function setMaterialBoostStrength(value, syncUrl = true) {
  modelPreviewOptions.materialBoostStrength = parseClampedNumber(value, 0, 0, 1);
  if (syncUrl) {
    setPreviewUrlParam("materialBoostStrength", modelPreviewOptions.materialBoostStrength);
  }
  refreshModelPreview({ materials: true });
}

function setModelSaturation(value, syncUrl = true) {
  modelPreviewOptions.saturation = parseClampedNumber(
    value,
    DEFAULT_MODEL_PREVIEW_OPTIONS.saturation,
    0,
    2
  );
  if (syncUrl) {
    setPreviewUrlParam("saturation", modelPreviewOptions.saturation);
  }
  refreshModelPreview();
}

function setCameraZoom(value, syncUrl = true) {
  modelPreviewOptions.cameraZoom = parseClampedNumber(
    value,
    DEFAULT_MODEL_PREVIEW_OPTIONS.cameraZoom,
    CAMERA_ZOOM_MIN,
    CAMERA_ZOOM_MAX
  );
  if (syncUrl) {
    setPreviewUrlParam("cameraZoom", modelPreviewOptions.cameraZoom);
  }
  updatePreviewControls();
  updateLocalModelDebug();
  updateModelAssetStatus();
}

function getReadingWpmDraft(value) {
  const draft = String(value).trim();
  if (!draft) {
    return null;
  }

  const nextWpm = Number(draft);
  if (
    !Number.isFinite(nextWpm) ||
    nextWpm < READING_WPM_MIN ||
    nextWpm > READING_WPM_MAX
  ) {
    return null;
  }

  return Math.round(nextWpm);
}

function setReadingWpmInputValidity(isValid) {
  readingWpmInput.dataset.valid = isValid ? "true" : "false";
  readingWpmInput.setAttribute("aria-invalid", isValid ? "false" : "true");
}

function setReadingWpm(value, syncUrl = true) {
  const nextWpm = getReadingWpmDraft(value);
  if (nextWpm === null) {
    setReadingWpmInputValidity(false);
    return;
  }

  setReadingWpmInputValidity(true);
  modelPreviewOptions.readingWpm = nextWpm;
  if (syncUrl) {
    setPreviewUrlParam("readingWpm", modelPreviewOptions.readingWpm);
  }
  updatePreviewControls();
  updateLocalModelDebug();
  updateModelAssetStatus();
}

function setMotionMode(value, syncUrl = true) {
  const motion = pickMotionChoice(value);
  modelPreviewOptions.motion = motion;
  if (syncUrl) {
    setPreviewUrlParam("motion", motion);
  }
  refreshModelPreview();
  applyLoadedModelMotion();
}

function setModelPreset(id) {
  if (!id || id === localAssetState?.selectedModelPreset?.id) {
    return;
  }

  setPreviewUrlParam("modelPreset", id);
  window.location.assign(`${window.location.pathname}?${queryParams.toString()}${window.location.hash}`);
}

function handleCameraWheelZoom(event) {
  event.preventDefault();
  const nextZoom = modelPreviewOptions.cameraZoom * Math.exp(event.deltaY * 0.0012);
  setCameraZoom(nextZoom);
}

function setPreviewChoice(option, value, syncUrl = true) {
  const choices = {
    mode: MODEL_MODE_CHOICES,
    lighting: MODEL_LIGHTING_CHOICES
  }[option];

  if (!choices?.includes(value)) {
    return;
  }

  modelPreviewOptions[option] = value;
  if (syncUrl) {
    setPreviewUrlParam(option, value);
  }
  refreshModelPreview({ materials: option === "mode" });
}

function isMmdTransparentLayerMaterial(material) {
  return Boolean(material?.opacity < 1 || material?.alphaMap);
}

function isMmdAlphaCutoutMaterial(material) {
  return Boolean(material?.map?.transparent);
}

function applyMmdTransparentLayerMaterial(material) {
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.alphaTest = Math.max(material.alphaTest || 0, PMX_ALPHA_LAYER_ALPHA_TEST);
  material.polygonOffset = false;
  material.polygonOffsetFactor = 0;
  material.polygonOffsetUnits = 0;
  material.needsUpdate = true;
}

function applyMmdAlphaCutoutMaterial(material) {
  material.transparent = false;
  material.depthWrite = true;
  material.depthTest = true;
  material.alphaTest = Math.max(material.alphaTest || 0, PMX_ALPHA_LAYER_ALPHA_TEST);
  material.polygonOffset = false;
  material.polygonOffsetFactor = 0;
  material.polygonOffsetUnits = 0;
  material.needsUpdate = true;
}

function syncMmdMaterialDepthMode(material) {
  if (isMmdTransparentLayerMaterial(material)) {
    applyMmdTransparentLayerMaterial(material);
    return true;
  }

  if (isMmdAlphaCutoutMaterial(material)) {
    applyMmdAlphaCutoutMaterial(material);
    return true;
  }

  return false;
}

function syncMmdTextureDepthMode(material) {
  if (!isMmdAlphaCutoutMaterial(material)) {
    return false;
  }

  applyMmdAlphaCutoutMaterial(material);
  return true;
}

function applyVrmMaterialDepthMode(material) {
  if (material.transparent || material.opacity < 1) {
    material.transparent = true;
    material.depthWrite = false;
    return;
  }

  if (material.alphaTest > 0) {
    material.transparent = false;
    material.depthWrite = true;
  }
}

function queueTextureDepthModeSync(material) {
  if (!material?.map || textureDepthModeCallbackMaterials.has(material)) {
    return;
  }

  textureDepthModeCallbackMaterials.add(material);
  const syncTextureAlpha = () => {
    if (syncMmdTextureDepthMode(material)) {
      updateLocalModelDebug();
    }
  };

  if (Array.isArray(material.map.readyCallbacks)) {
    material.map.readyCallbacks.push(syncTextureAlpha);
  } else {
    syncTextureAlpha();
  }
}

function frameLoadedModel(mesh) {
  mesh.updateMatrixWorld(true);
  modelBounds.setFromObject(mesh);
  modelBounds.getCenter(modelCenter);
  modelBounds.getSize(modelSize);

  const height = Math.max(modelSize.y, 0.001);
  const scale = 3.05 / height;
  mesh.scale.setScalar(scale);
  mesh.updateMatrixWorld(true);

  modelBounds.setFromObject(mesh);
  modelBounds.getCenter(modelCenter);
  modelBounds.getSize(modelSize);
  mesh.position.x -= modelCenter.x;
  mesh.position.y -= modelBounds.min.y - 0.36;
  mesh.position.z -= modelCenter.z;
  mesh.rotation.y = 0;
  mesh.updateMatrixWorld(true);

  lookTarget.set(0, 2.05, 0);
  cameraMode = 1;
  drag.yaw = 0;
  drag.pitch = 0;
}

function getMaterialList(material) {
  if (!material) {
    return [];
  }
  return Array.isArray(material) ? material : [material];
}

function getModelKind(asset) {
  const configuredKind = String(asset?.kind || "").toLowerCase();
  if (configuredKind) {
    return configuredKind;
  }

  const path = String(asset?.path || asset?.url || "").toLowerCase();
  if (path.endsWith(".vrm")) {
    return "vrm";
  }
  if (path.endsWith(".pmd")) {
    return "pmd";
  }
  return "pmx";
}

function getModelFormatLabel(kind = activeModelKind) {
  return String(kind || "model").toUpperCase();
}

function countModelBones(mesh) {
  let bones = 0;
  mesh?.traverse?.((object) => {
    if (object.isBone) {
      bones += 1;
    }
  });
  return bones || mesh?.skeleton?.bones?.length || 0;
}

function isGeneratedVrmOutlineMaterial(material) {
  return Boolean(material?.isOutline || /\s+\(Outline\)$/i.test(material?.name || ""));
}

function rememberOriginalMaterialState(material) {
  if (!material || originalMaterialStates.has(material)) {
    return;
  }

  originalMaterialStates.set(material, {
    color: material.color?.clone(),
    emissive: material.emissive?.clone(),
    emissiveIntensity: material.emissiveIntensity,
    opacity: material.opacity,
    transparent: material.transparent,
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    alphaTest: material.alphaTest,
    polygonOffset: material.polygonOffset,
    polygonOffsetFactor: material.polygonOffsetFactor,
    polygonOffsetUnits: material.polygonOffsetUnits,
    visible: material.visible,
    side: material.side
  });
}

function restoreOriginalMaterialState(material) {
  const state = originalMaterialStates.get(material);
  if (!state) {
    return;
  }

  if (state.color && material.color) {
    material.color.copy(state.color);
  }
  if (state.emissive && material.emissive) {
    material.emissive.copy(state.emissive);
  }
  if (state.emissiveIntensity !== undefined) {
    material.emissiveIntensity = state.emissiveIntensity;
  }
  material.opacity = state.opacity;
  material.transparent = state.transparent;
  material.depthTest = state.depthTest;
  material.depthWrite = state.depthWrite;
  material.alphaTest = state.alphaTest;
  material.polygonOffset = state.polygonOffset;
  material.polygonOffsetFactor = state.polygonOffsetFactor;
  material.polygonOffsetUnits = state.polygonOffsetUnits;
  material.visible = state.visible;
  material.side = state.side;
}

function rememberMeshMaterials(object) {
  if (!originalMeshMaterials.has(object)) {
    originalMeshMaterials.set(object, object.material);
    getMaterialList(object.material).forEach(rememberOriginalMaterialState);
  }
}

function restoreMeshMaterials(object) {
  if (originalMeshMaterials.has(object)) {
    object.material = originalMeshMaterials.get(object);
  }
  getMaterialList(object.material).forEach(restoreOriginalMaterialState);
}

function getMmdAlphaLayerStats(mesh = realDancer) {
  const stats = {
    active: 0,
    cutouts: 0,
    transparentTextures: 0,
    transparentMaterials: 0,
    alphaMaps: 0
  };

  if (!mesh) {
    return stats;
  }

  mesh.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    getMaterialList(object.material).forEach((material) => {
      if (!material) {
        return;
      }

      if (material.map?.transparent) {
        stats.transparentTextures += 1;
      }
      if (material.transparent || material.opacity < 1) {
        stats.transparentMaterials += 1;
      }
      if (material.alphaMap) {
        stats.alphaMaps += 1;
      }
      if (material.transparent && material.depthWrite === false) {
        stats.active += 1;
      }
      if (
        material.map?.transparent &&
        material.transparent === false &&
        material.depthWrite === true &&
        material.alphaTest > 0
      ) {
        stats.cutouts += 1;
      }
    });
  });

  return stats;
}

function setModelMaterials(mesh, kind = activeModelKind) {
  mesh.traverse((object) => {
    if (!object.isMesh) {
      return;
    }
    object.castShadow = true;
    object.frustumCulled = false;
    rememberMeshMaterials(object);

    if (modelPreviewOptions.mode === "clay") {
      object.material = clayPreviewMaterial;
      return;
    }

    restoreMeshMaterials(object);
    const meshMaterials = getMaterialList(object.material);
    meshMaterials.forEach((material) => {
      if (kind === "vrm" && isGeneratedVrmOutlineMaterial(material)) {
        material.visible = false;
        material.needsUpdate = true;
        return;
      }

      material.side = THREE.DoubleSide;
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
      }
      const syncedMmdDepth = kind === "pmx" || kind === "pmd"
        ? syncMmdMaterialDepthMode(material)
        : false;
      if (kind === "pmx" || kind === "pmd") {
        queueTextureDepthModeSync(material);
      }
      if (kind === "vrm") {
        applyVrmMaterialDepthMode(material);
      } else if (!syncedMmdDepth) {
        material.transparent = material.opacity < 1;
        material.depthWrite = material.opacity >= 1;
      }
      if (material.color && material.emissive) {
        material.emissive.copy(material.color).multiplyScalar(
          modelPreviewOptions.materialBoostStrength * 0.15
        );
        material.emissiveIntensity = modelPreviewOptions.materialBoostStrength;
      }
      material.needsUpdate = true;
    });
  });
}

function activateLoadedModel(mesh, modelAsset, { kind = getModelKind(modelAsset), vrm = null } = {}) {
  modelPreviewOptions = getModelPreviewOptions(localAssetState?.scene);
  updatePreviewControls();
  realDancer = mesh;
  activeVrm = vrm;
  activeModelKind = kind;
  motionController.clipCache.clear();
  window.localModel = realDancer;
  window.localVrm = activeVrm;
  realDancer.name = modelAsset.label || `Local ${getModelFormatLabel(kind)} model`;
  const soulSkeleton = createSoulSkeleton(realDancer, { kind, vrm });
  realDancer.userData.soulEchoModel = {
    format: "soulecho-model",
    version: 1,
    sourceFormat: kind,
    skeleton: soulSkeleton
  };
  setModelMaterials(realDancer, kind);
  frameLoadedModel(realDancer);
  if (kind === "vrm") {
    realDancer.rotation.y = Math.PI;
    realDancer.updateMatrixWorld(true);
  }
  const blinkTargets = configureBlink(realDancer, activeVrm);
  populateEyeMorphSelect(realDancer, activeVrm);
  populateFaceEmoteSelect(activeVrm);
  populateOutfitMorphSelect(realDancer);
  scene.add(realDancer);
  stage.visible = false;
  modelPreview.visible = true;
  if (modelGuideLine) {
    modelGuideLine.visible = false;
  }
  modelAmbientLight.visible = true;
  modelFillLight.visible = true;
  modelSideLight.visible = true;
  modelHairLight.visible = true;
  scene.fog = null;
  applyModelPreviewLighting();
  activeDancer = realDancer;
  window.localModelDebug = {
    name: realDancer.name,
    kind,
    modelPath: modelAsset.path,
    modelPreset: modelAsset.id || "default",
    bones: countModelBones(realDancer),
    blinkMorphs: blinkTargets.map((target) => target.name),
    eyeMorphs: eyeMorphController.options.map((option) => option.name),
    eyeMorph: "Default eyes",
    faceEmotes: faceEmoteController.options.map((option) => option.name),
    faceEmote: "Default face",
    outfitMorphs: outfitMorphController.options.map((option) => option.name),
    outfitMorph: "Default outfit",
    position: realDancer.position.toArray(),
    scale: realDancer.scale.toArray(),
    stageLighting: modelPreviewOptions.stageLighting,
    motion: modelPreviewOptions.motion,
    motionOptions: motionController.options.map((option) => option.label),
    motionStatus: motionController.status,
    visible: realDancer.visible,
    vrmMeta: activeVrm?.meta || null,
    soulEchoModel: {
      format: realDancer.userData.soulEchoModel.format,
      version: realDancer.userData.soulEchoModel.version,
      sourceFormat: realDancer.userData.soulEchoModel.sourceFormat,
      skeleton: serializeSoulSkeletonForDebug(soulSkeleton)
    }
  };
  updateLocalModelDebug();
  applyLoadedModelMotion();
  return realDancer;
}

function activateProceduralDancer(modelAsset) {
  modelPreviewOptions = getModelPreviewOptions(localAssetState?.scene);
  updatePreviewControls();

  realDancer = null;
  activeVrm = null;
  activeModelKind = "procedural";
  motionController.clipCache.clear();

  const dancer = createDancer();
  dancer.name = modelAsset.label || "Astera";
  dancer.userData.procedural = true;
  activeDancer = dancer;
  window.localModel = dancer;
  window.localVrm = null;

  stage.visible = true;
  modelPreview.visible = false;
  modelAmbientLight.visible = false;
  modelFillLight.visible = false;
  modelSideLight.visible = false;
  modelHairLight.visible = false;
  scene.fog = null;
  applyModelPreviewLighting();

  assetStatus.dataset.state = "ready";
  assetStatus.innerHTML = `
    <span>Procedural model</span>
    <strong>${dancer.name}</strong>
    <small>#07090f suit · ${modelPreviewOptions.motion} · sat ${formatPreviewNumber(modelPreviewOptions.saturation)} · stage ${Math.round(modelPreviewOptions.stageLighting * 100)}%</small>
  `;

  window.localModelDebug = {
    name: dancer.name,
    kind: activeModelKind,
    modelPath: modelAsset.path,
    modelPreset: modelAsset.id || "astera",
    suit: "#07090f",
    motion: modelPreviewOptions.motion,
    visible: dancer.visible
  };

  return dancer;
}

function loadPmxModel(modelAsset) {
  const loader = new MMDLoader();
  const kind = getModelKind(modelAsset);
  return new Promise((resolve, reject) => {
    loader.load(
      modelAsset.url,
      (mesh) => resolve(activateLoadedModel(mesh, modelAsset, { kind })),
      undefined,
      reject
    );
  });
}

function loadVrmModel(modelAsset) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  return new Promise((resolve, reject) => {
    loader.load(
      modelAsset.url,
      (gltf) => {
        const vrm = gltf.userData.vrm;
        if (!vrm?.scene) {
          reject(new Error("VRM file did not contain a usable VRM scene"));
          return;
        }
        VRMUtils.rotateVRM0(vrm);
        resolve(activateLoadedModel(vrm.scene, modelAsset, { kind: "vrm", vrm }));
      },
      undefined,
      reject
    );
  });
}

function loadConfiguredModel(state) {
  const modelAsset = state.selectedModelPreset || state.assets.find((asset) => asset.name === "model");
  if (!modelAsset?.ok || !modelAsset.url) {
    return Promise.resolve(null);
  }

  assetStatus.dataset.state = "ready";
  assetStatus.innerHTML = `
    <span>Local model</span>
    <strong>Loading</strong>
    <small>${modelAsset.label || modelAsset.path}</small>
  `;

  const kind = getModelKind(modelAsset);
  if (kind === "procedural") {
    return Promise.resolve(activateProceduralDancer(modelAsset));
  }

  return kind === "vrm" ? loadVrmModel(modelAsset) : loadPmxModel(modelAsset);
}

function render() {
  requestAnimationFrame(render);
  const delta = clock.getDelta();
  const animationDelta = playing ? delta : 0;
  if (playing) {
    elapsed += delta;
  }
  if (realDancer) {
    updateLoadedModelMotion(animationDelta);
    updateBlink(animationDelta);
    activeVrm?.update?.(animationDelta);
    applyModelPreviewLighting();
  }
  if (activeDancer && !realDancer) {
    animateDancer(elapsed);
  }
  if (stage.visible) {
    animateStage(elapsed);
  }
  updateCamera(elapsed);
  updateSpeechBubblePosition();
  composer.render();
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  composer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

togglePlay.addEventListener("click", () => {
  playing = !playing;
  togglePlay.dataset.state = playing ? "" : "paused";
  togglePlay.setAttribute("aria-label", playing ? "Pause animation" : "Play animation");
  togglePlay.title = playing ? "Pause" : "Play";
});

cameraModeButton.addEventListener("click", () => {
  cameraMode = (cameraMode + 1) % CAMERA_ANGLE_PRESETS.length;
  drag.yaw = 0;
  drag.pitch = 0;
  const preset = CAMERA_ANGLE_PRESETS[cameraMode] || CAMERA_ANGLE_PRESETS[0];
  cameraModeButton.title = `Camera: ${preset.label}`;
  cameraModeButton.setAttribute("aria-label", `Camera angle: ${preset.label}`);
});

modelPresetSelect.addEventListener("change", (event) => {
  setModelPreset(event.currentTarget.value);
});

faceModelSelect.addEventListener("change", (event) => {
  setFaceModel(event.currentTarget.value);
});

saveDemoProfileButton.addEventListener("click", () => {
  openProfileSaveDialog();
});

profileSaveForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const requestedName = normalizeDemoConfigurationName(profileSaveNameInput.value);
  profileSaveNameInput.value = requestedName;
  saveDemoProfileButton.disabled = true;
  profileSaveForm.querySelector("button[type='submit']").disabled = true;
  saveDemoProfileButton.dataset.state = "saving";
  try {
    await saveDemoProfile(requestedName);
    closeProfileSaveDialog();
  } finally {
    saveDemoProfileButton.disabled = false;
    profileSaveForm.querySelector("button[type='submit']").disabled = false;
    saveDemoProfileButton.dataset.state = "";
  }
});

cancelProfileSaveButton.addEventListener("click", () => {
  closeProfileSaveDialog();
});

profileSaveDialog.addEventListener("click", (event) => {
  if (event.target === profileSaveDialog) {
    closeProfileSaveDialog();
  }
});

eyeMorphSelect.addEventListener("change", (event) => {
  applyEyeMorphSelection(event.currentTarget.value);
});

faceEmoteSelect.addEventListener("change", (event) => {
  applyFaceEmoteSelection(event.currentTarget.value);
});

outfitMorphSelect.addEventListener("change", (event) => {
  applyOutfitMorphSelection(event.currentTarget.value);
});

motionModeSelect.addEventListener("change", (event) => {
  setMotionMode(event.currentTarget.value);
});

speechPhraseSelect.addEventListener("change", (event) => {
  setSpeechPhrase(event.currentTarget.value);
});

dialogueForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitDialoguePrompt(dialogueInput.value);
});

companionFacePlay.addEventListener("click", () => {
  companionFaceVideo.play()
    .then(() => {
      revealPendingCompanionText();
      companionFacePlay.hidden = true;
      setCompanionFaceState("playing", "Speaking");
    })
    .catch((error) => {
      setCompanionFaceState(
        "error",
        "Voice error",
        error instanceof Error ? error.message : "Playback was blocked"
      );
    });
});

clearMemoryButton.addEventListener("click", () => {
  const memoryDialogWasOpen = memoryDialog.open;
  clearAllCompanionMemory();
  addDialogueLine("system", "all local memory cleared");
  if (memoryDialogWasOpen) {
    renderStoredMetadata();
  }
  showSpeechPhrase("I cleared the local memory.");
  if (memoryDialogWasOpen) {
    clearMemoryButton.focus();
  } else {
    dialogueInput.focus();
  }
});

viewMemoryButton.addEventListener("click", () => {
  openMemoryDialog();
});

closeMemoryDialog.addEventListener("click", () => {
  closeStoredMemoryDialog();
});

memoryDialog.addEventListener("click", (event) => {
  if (event.target === memoryDialog) {
    closeStoredMemoryDialog();
  }
});

stageLightingSlider.addEventListener("input", (event) => {
  setStageLighting(event.currentTarget.value);
});

modelBloomSlider.addEventListener("input", (event) => {
  setBloomStrength(event.currentTarget.value);
});

materialBoostStrengthSlider.addEventListener("input", (event) => {
  setMaterialBoostStrength(event.currentTarget.value);
});

modelSaturationSlider.addEventListener("input", (event) => {
  setModelSaturation(event.currentTarget.value);
});

readingWpmInput.addEventListener("input", (event) => {
  setReadingWpm(event.currentTarget.value);
});

previewOptionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setPreviewChoice(button.dataset.optionGroup, button.dataset.optionValue);
  });
});

initializeAppMode();
pruneDeprecatedPreviewUrlParams();
populateSpeechPhraseSelect();
addDialogueLine("system", isDemoMode() ? "demo mode ready" : `${OLLAMA_MODEL} ready`);
updatePreviewControls();

canvas.addEventListener("pointerdown", (event) => {
  drag.active = true;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!drag.active) {
    return;
  }
  const dx = event.clientX - drag.lastX;
  const dy = event.clientY - drag.lastY;
  drag.yaw -= dx * 0.006;
  drag.pitch += dy * 0.004;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
});

canvas.addEventListener("pointerup", (event) => {
  drag.active = false;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
});

canvas.addEventListener("pointercancel", (event) => {
  drag.active = false;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
});

canvas.addEventListener("wheel", handleCameraWheelZoom, { passive: false });
previewControls.addEventListener("wheel", handleCameraWheelZoom, { passive: false });

canvas.addEventListener("dblclick", (event) => {
  if (!activeDancer) {
    return;
  }

  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(activeDancer, true)[0];
  if (hit) {
    cameraMode = 1;
  }
});

window.addEventListener("resize", resize);

const loadAssetConfig = isDemoMode() ? loadDemoAssetConfig : loadStudioAssetConfig;

loadAppSettings();

loadAssetConfig()
  .then(async (state) => {
    localAssetState = state;
    window.localAssetState = state;
    if (state.config?.configuration) {
      demoConfigurationName = normalizeDemoConfigurationName(state.config.configuration);
      document.documentElement.dataset.demoConfiguration = demoConfigurationName;
    }
    configureMotionOptions(state);
    populateModelPresetSelect(state);
    await loadFaceModelOptions(state.config?.faceModel);
    applyConfiguredFaceModel(state.config?.faceModel);
    initializeCompanionFace();
    renderAssetStatus(state, assetStatus);
    showInitialSpeechPhrase(state.config);
    return loadConfiguredModel(state);
  })
  .then((mesh) => {
    if (!mesh) {
      return;
    }
    window.localModel = mesh;
    updateModelAssetStatus();
    startDemoScheduler(localAssetState?.config);
  })
  .catch((error) => {
    setSpeechPhrase(TEST_SPEECH_PHRASES[0]);
    assetStatus.dataset.state = "warning";
    assetStatus.innerHTML = `
      <span>Local assets</span>
      <strong>0/0</strong>
      <small>${error instanceof Error ? error.message : "Config unavailable"}</small>
    `;
  })
  .finally(() => {
    finishInitialLoad();
  });

render();
