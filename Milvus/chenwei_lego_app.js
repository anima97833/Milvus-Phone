/**
 * Milvus/chenwei_lego_app.js
 * 「谶纬小摊 2.0」极简居中 3D 乐高积木拼装舞台 + 底部问卦条 + 可折叠多功能侧边栏
 * - 零 emoji 图标：全部采用定制古风细线手绘矢量 SVG + 参数化乐高零件小图
 * - 中央 85%+ 视口纯粹留给 Three.js 3D 拼装与问卦；简介/零件/名士谶纬/历史卷宗全部收入侧边栏
 * - 支持手机单指旋转/双指缩放/轻点落砖、90° 旋转、撤销重做、擦除模式、名士逐块落砖动画
 */
(function (global) {
  "use strict";

  // ==========================================
  // 1. 定制手绘矢量 SVG 图标库（零 Emoji）
  // ==========================================
  function SvgIcon(h, name, { size = 18, color = "currentColor", strokeWidth = 1.75 } = {}) {
    const common = {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { display: "block", flexShrink: 0 }
    };

    switch (name) {
      case "back":
        return h("svg", common,
          h("path", { d: "M15 5l-7 7 7 7" }),
          h("path", { d: "M8 12h11" })
        );
      case "sidebar":
        return h("svg", common,
          h("rect", { x: 3, y: 4, width: 18, height: 16, rx: 3 }),
          h("path", { d: "M14.5 4v16" }),
          h("path", { d: "M7 9h4M7 13h4" })
        );
      case "undo":
        return h("svg", common,
          h("path", { d: "M8 7L4 11l4 4" }),
          h("path", { d: "M4 11h10a5 5 0 0 1 0 10h-3" })
        );
      case "redo":
        return h("svg", common,
          h("path", { d: "M16 7l4 4-4 4" }),
          h("path", { d: "M20 11H10a5 5 0 0 0 0 10h3" })
        );
      case "rotate":
        return h("svg", common,
          h("path", { d: "M20 12a8 8 0 1 1-2.4-5.7" }),
          h("path", { d: "M20 4v5h-5" })
        );
      case "eraser":
        return h("svg", common,
          h("path", { d: "M15.5 4.5l4 4-9 9H6.5l-2-2 11-11z" }),
          h("path", { d: "M10.5 9.5l4 4" }),
          h("path", { d: "M13 17.5h7" })
        );
      case "clear":
        return h("svg", common,
          h("path", { d: "M4 7h16" }),
          h("path", { d: "M9 7V4h6v3" }),
          h("path", { d: "M6.5 7l1 12.5A1.5 1.5 0 0 0 9 21h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7" }),
          h("path", { d: "M10 11v6M14 11v6" })
        );
      case "oracle": // 古风八卦星盘
        return h("svg", common,
          h("polygon", { points: "12,2.5 18.7,5.3 21.5,12 18.7,18.7 12,21.5 5.3,18.7 2.5,12 5.3,5.3" }),
          h("circle", { cx: 12, cy: 12, r: 4.2 }),
          h("path", { d: "M12 7.8a2.1 2.1 0 0 1 0 4.2 2.1 2.1 0 0 0 0 4.2" }),
          h("circle", { cx: 12, cy: 9.9, r: 0.6, fill: color }),
          h("circle", { cx: 12, cy: 14.1, r: 0.6, fill: color })
        );
      case "close":
        return h("svg", common,
          h("path", { d: "M6 6l12 12M18 6L6 18" })
        );
      case "share":
        return h("svg", common,
          h("path", { d: "M21 4L10 15" }),
          h("path", { d: "M21 4l-6.5 17-4.5-6-6-4.5L21 4z" })
        );
      case "refresh":
        return h("svg", common,
          h("path", { d: "M20 7a8 8 0 0 0-14.5-1.5" }),
          h("path", { d: "M4 17a8 8 0 0 0 14.5 1.5" }),
          h("path", { d: "M20 3v4h-4M4 21v-4h4" })
        );
      case "takeover":
        return h("svg", common,
          h("path", { d: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" }),
          h("path", { d: "M12 12l8-4.5M12 12v9M12 12L4 7.5" })
        );
      case "tab_bricks":
        return h("svg", common,
          h("rect", { x: 3.5, y: 9, width: 17, height: 10.5, rx: 1.5 }),
          h("path", { d: "M6.5 9V6.5h3.5V9M14 9V6.5h3.5V9" })
        );
      case "tab_chars":
        return h("svg", common,
          h("circle", { cx: 12, cy: 8.5, r: 3.8 }),
          h("path", { d: "M5 19.5c1.2-3.6 4-5.3 7-5.3s5.8 1.7 7 5.3" })
        );
      case "tab_records":
        return h("svg", common,
          h("path", { d: "M6 4h10a2.5 2.5 0 0 1 2.5 2.5V20l-4-2-4 2-4-2-2.5 1.2V6.5A2.5 2.5 0 0 1 6 4z" }),
          h("path", { d: "M8.5 8.5h6M8.5 12h6" })
        );
      case "tab_info":
        return h("svg", common,
          h("circle", { cx: 12, cy: 12, r: 9 }),
          h("path", { d: "M12 11v5.5" }),
          h("circle", { cx: 12, cy: 7.8, r: 0.8, fill: color })
        );
      case "eye":
        return h("svg", common,
          h("path", { d: "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" }),
          h("circle", { cx: 12, cy: 12, r: 2.8 })
        );
      case "send":
        return h("svg", common,
          h("path", { d: "M21 3L10 14" }),
          h("path", { d: "M21 3l-7 18-4-7-7-4 18-7z" })
        );
      default:
        return h("svg", common, h("circle", { cx: 12, cy: 12, r: 6 }));
    }
  }

  // 手绘乐高零件矢量小图（按零件造型 + 选中色实时着色）
  function BrickShapeSvg(h, shape, hex = "#C84B31", size = 28) {
    const stroke = "#3E342B";
    const c = {
      width: size,
      height: size,
      viewBox: "0 0 32 32",
      fill: "none",
      stroke,
      strokeWidth: 1.5,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { display: "block", flexShrink: 0 }
    };

    if (shape === "plate" || shape === "tile") {
      return h("svg", c,
        h("polygon", { points: "4,19 16,13 28,19 16,25", fill: hex, fillOpacity: 0.9 }),
        h("path", { d: "M4 19v3l12 6 12-6v-3", fill: hex, fillOpacity: 0.65 }),
        shape === "plate" && h("ellipse", { cx: 16, cy: 17.5, rx: 3, ry: 1.4, fill: hex })
      );
    }
    if (shape === "slope" || shape === "bracket") {
      return h("svg", c,
        h("polygon", { points: "5,24 14,10 27,24", fill: hex, fillOpacity: 0.88 }),
        h("path", { d: "M5 24h22M14 10v14", strokeOpacity: 0.45 })
      );
    }
    if (shape === "pyramid") {
      return h("svg", c,
        h("polygon", { points: "16,6 5,24 16,27 27,24", fill: hex, fillOpacity: 0.88 }),
        h("path", { d: "M16 6v21" })
      );
    }
    if (shape === "pillar") {
      return h("svg", c,
        h("rect", { x: 10, y: 24, width: 12, height: 3, rx: 0.8, fill: hex }),
        h("rect", { x: 12, y: 8, width: 8, height: 16, fill: hex, fillOpacity: 0.88 }),
        h("rect", { x: 10, y: 5, width: 12, height: 3, rx: 0.8, fill: hex })
      );
    }
    if (shape === "arch") {
      return h("svg", c,
        h("path", { d: "M5 25V9h22v16h-6v-8a5 5 0 0 0-10 0v8H5z", fill: hex, fillOpacity: 0.88 })
      );
    }
    if (shape === "round") {
      return h("svg", c,
        h("ellipse", { cx: 16, cy: 22, rx: 10, ry: 4.5, fill: hex, fillOpacity: 0.72 }),
        h("path", { d: "M6 14v8M26 14v8" }),
        h("ellipse", { cx: 16, cy: 14, rx: 10, ry: 4.5, fill: hex, fillOpacity: 0.95 })
      );
    }
    if (shape === "orb") {
      return h("svg", c,
        h("path", { d: "M10 26h12l-2-4h-8l-2 4z", fill: "#D4A03C" }),
        h("circle", { cx: 16, cy: 14, r: 7.5, fill: hex, fillOpacity: 0.86 }),
        h("path", { d: "M12.5 11.5a4 4 0 0 1 4-2.5", stroke: "#FFFFFF", strokeWidth: 1.6 })
      );
    }
    if (shape === "lantern") {
      return h("svg", c,
        h("path", { d: "M9 11l7-5 7 5H9z", fill: "#D4A03C" }),
        h("rect", { x: 11, y: 11, width: 10, height: 11, rx: 2, fill: hex, fillOpacity: 0.9 }),
        h("path", { d: "M10 22h12l-2 4h-8l-2-4z", fill: "#D4A03C" })
      );
    }
    if (shape === "ding") {
      return h("svg", c,
        h("path", { d: "M8 11h16v6a8 8 0 0 1-16 0v-6z", fill: hex, fillOpacity: 0.88 }),
        h("path", { d: "M10 11V8M22 11V8M11 23l-1.5 4M21 23l1.5 4M16 24v3.5" })
      );
    }
    if (shape === "spire") {
      return h("svg", c,
        h("rect", { x: 10, y: 22, width: 12, height: 5, rx: 1, fill: hex }),
        h("polygon", { points: "16,4 11.5,22 20.5,22", fill: hex, fillOpacity: 0.9 }),
        h("circle", { cx: 16, cy: 4, r: 1.8, fill: "#D4A03C" })
      );
    }
    // 默认乐高凸点方砖
    return h("svg", c,
      h("rect", { x: 5, y: 12, width: 22, height: 13, rx: 1.8, fill: hex, fillOpacity: 0.9 }),
      h("rect", { x: 8.5, y: 8, width: 5, height: 4, rx: 0.8, fill: hex }),
      h("rect", { x: 18.5, y: 8, width: 5, height: 4, rx: 0.8, fill: hex })
    );
  }

  // ==========================================
  // 2. 主页面组件：NuoChenweiLegoPage
  // ==========================================
  function NuoChenweiLegoPage({ onBack }) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    const Bricks = global.ChenweiLegoBricks;
    const Oracle = global.ChenweiAiOracle;
    if (!Bricks || !Oracle) return null;

    // 积木状态与撤销/重做栈
    const [bricks, setBricks] = useState(() => Bricks.PRESET_BUILDS[0].build());
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    // 当前选中的乐高零件/配色/旋转/工具模式
    const [selectedType, setSelectedType] = useState("brick_2x2");
    const [selectedColor, setSelectedColor] = useState("cinnabar");
    const [selectedRot, setSelectedRot] = useState(0);
    const [activeBrickCat, setActiveBrickCat] = useState("basic");
    const [toolMode, setToolMode] = useState("build"); // "build" | "erase"

    // 侧边栏与视图模式（玩家自建 vs 查看名士谶纬）
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarTab, setSidebarTab] = useState("bricks"); // "bricks" | "chars" | "records" | "info"
    const [viewingCharProphecy, setViewingCharProphecy] = useState(null);
    const [prophecyCardExpanded, setProphecyCardExpanded] = useState(true);

    // 问卦与解签（三体裁切换 + 指定名士解签博弈 + 多轮追问）
    const [question, setQuestion] = useState("");
    const [isDivining, setIsDivining] = useState(false);
    const [oracleResult, setOracleResult] = useState(null);
    const [activeVerseForm, setActiveVerseForm] = useState("poem"); // "poem" | "ballad" | "chenyu"
    const [prophecyVerseForm, setProphecyVerseForm] = useState("poem");
    const [commentatorCharId, setCommentatorCharId] = useState("");
    const [selectedInterpCharId, setSelectedInterpCharId] = useState("");
    const [interpretingCharId, setInterpretingCharId] = useState("");
    const [followUpInput, setFollowUpInput] = useState("");
    const [sendingFollowUp, setSendingFollowUp] = useState(false);
    const [revealedMotiveMap, setRevealedMotiveMap] = useState({});
    const [shareModalPayload, setShareModalPayload] = useState(null);
    const [shareNoteInput, setShareNoteInput] = useState("");
    const [sharingCharId, setSharingCharId] = useState("");

    // 名士列表、头像缓存、名士谶纬缓存、历史卷宗
    const [characters, setCharacters] = useState([]);
    const [avatarMap, setAvatarMap] = useState({});
    const [charProphecies, setCharProphecies] = useState({});
    const [loadingCharId, setLoadingCharId] = useState("");
    const [records, setRecords] = useState([]);
    const [toast, setToast] = useState("");

    const canvasMountRef = useRef(null);
    const sceneApiRef = useRef(null);
    const bricksRef = useRef(bricks);
    const toolStateRef = useRef({ selectedType, selectedColor, selectedRot, toolMode, viewing: false, uiBlocked: false });
    const animTimerRef = useRef(null);
    const interpReqSeqRef = useRef(0);

    useEffect(() => { bricksRef.current = bricks; }, [bricks]);
    useEffect(() => {
      const uiBlocked = Boolean(sidebarOpen || oracleResult);
      toolStateRef.current = {
        selectedType,
        selectedColor,
        selectedRot,
        toolMode,
        viewing: !!viewingCharProphecy,
        uiBlocked
      };
      if (uiBlocked && sceneApiRef.current && typeof sceneApiRef.current.resetPointers === "function") {
        sceneApiRef.current.resetPointers();
      }
    }, [selectedType, selectedColor, selectedRot, toolMode, viewingCharProphecy, sidebarOpen, oracleResult]);

    const flashToast = (msg) => {
      setToast(msg);
      setTimeout(() => setToast(""), 2200);
    };

    const commitBricks = (nextBricks) => {
      setUndoStack((prev) => [...prev.slice(-39), bricksRef.current]);
      setRedoStack([]);
      setBricks(nextBricks);
    };

    const handleUndo = () => {
      if (!undoStack.length) return;
      const prev = undoStack[undoStack.length - 1];
      setUndoStack((s) => s.slice(0, -1));
      setRedoStack((r) => [...r, bricksRef.current]);
      setBricks(prev);
    };

    const handleRedo = () => {
      if (!redoStack.length) return;
      const next = redoStack[redoStack.length - 1];
      setRedoStack((r) => r.slice(0, -1));
      setUndoStack((s) => [...s, bricksRef.current]);
      setBricks(next);
    };

    // 初始化加载名士、5级头像解析、IDB 卷宗与名士谶纬缓存
    useEffect(() => {
      let alive = true;
      (async () => {
        const [chars, recs, cProps] = await Promise.all([
          Oracle.loadAllCharacters(),
          Oracle.loadOracleRecords(30),
          Oracle.loadAllCharProphecies()
        ]);
        if (!alive) return;
        setCharacters(chars);
        setRecords(recs);
        setCharProphecies(cProps);

        const pairs = await Promise.all(
          chars.map((c) => Oracle.resolveCharAvatarUrl(c).then((u) => [String(c.id), u]))
        );
        if (!alive) return;
        const amap = {};
        pairs.forEach(([k, v]) => { if (v) amap[k] = v; });
        setAvatarMap(amap);
      })();
      return () => {
        alive = false;
        if (animTimerRef.current) clearInterval(animTimerRef.current);
      };
    }, []);

    // ==========================================
    // 3. Three.js r128 乐高 3D 舞台与手势交互引擎
    // ==========================================
    useEffect(() => {
      const THREE = global.THREE;
      const container = canvasMountRef.current;
      if (!THREE || !container) return;

      const width = container.clientWidth || global.innerWidth || 375;
      const height = container.clientHeight || global.innerHeight || 667;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#F4EFE6");
      scene.fog = new THREE.FogExp2("#F4EFE6", 0.016);

      const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 150);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.innerHTML = "";
      container.appendChild(renderer.domElement);

      // 柔暖古风日光体系
      const hemi = new THREE.HemisphereLight("#FFFDF7", "#C8B8A2", 0.78);
      scene.add(hemi);
      const dirLight = new THREE.DirectionalLight("#FFF4DF", 0.95);
      dirLight.position.set(10, 18, 12);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 2;
      dirLight.shadow.camera.far = 45;
      dirLight.shadow.camera.left = -10;
      dirLight.shadow.camera.right = 10;
      dirLight.shadow.camera.top = 10;
      dirLight.shadow.camera.bottom = -10;
      scene.add(dirLight);
      const fillLight = new THREE.DirectionalLight("#D6E4F0", 0.35);
      fillLight.position.set(-10, 8, -10);
      scene.add(fillLight);

      // 12×12 乐高凸点玉石底板
      const baseGroup = new THREE.Group();
      const boardGeo = new THREE.BoxGeometry(12.4, 0.36, 12.4);
      const boardMat = new THREE.MeshStandardMaterial({ color: "#E6DCCB", roughness: 0.65, metalness: 0.05 });
      const boardMesh = new THREE.Mesh(boardGeo, boardMat);
      boardMesh.position.y = -0.18;
      boardMesh.receiveShadow = true;
      baseGroup.add(boardMesh);

      const rimMat = new THREE.MeshStandardMaterial({ color: "#B89B72", roughness: 0.5, metalness: 0.2 });
      const rim = new THREE.Mesh(new THREE.BoxGeometry(12.7, 0.24, 12.7), rimMat);
      rim.position.y = -0.24;
      baseGroup.add(rim);

      const gridHelper = new THREE.GridHelper(12, 12, "#B8A58D", "#D5C8B5");
      gridHelper.position.y = 0.01;
      baseGroup.add(gridHelper);

      // 隐形底板射线平面（y=0）
      const rayPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 12),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      rayPlane.rotation.x = -Math.PI / 2;
      rayPlane.position.y = 0;
      baseGroup.add(rayPlane);
      scene.add(baseGroup);

      const bricksGroup = new THREE.Group();
      scene.add(bricksGroup);

      // 球面轨道相机状态
      const camState = { theta: 0.72, phi: 0.96, radius: 13.5, targetY: 1.5 };
      const updateCamera = () => {
        const x = camState.radius * Math.sin(camState.phi) * Math.sin(camState.theta);
        const y = camState.targetY + camState.radius * Math.cos(camState.phi);
        const z = camState.radius * Math.sin(camState.phi) * Math.cos(camState.theta);
        camera.position.set(x, Math.max(1.2, y), z);
        camera.lookAt(0, camState.targetY, 0);
      };
      updateCamera();

      // 射线拾取与轻点落砖/删砖
      const raycaster = new THREE.Raycaster();
      const pointerNdc = new THREE.Vector2();
      let ghostMesh = null;

      const clearGhost = () => {
        if (ghostMesh) {
          scene.remove(ghostMesh);
          ghostMesh = null;
        }
      };

      const computeHit = (clientX, clientY) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);
        const brickHits = raycaster.intersectObjects(bricksGroup.children, true);
        if (brickHits.length > 0) {
          const hit = brickHits[0];
          let obj = hit.object;
          while (obj && !obj.userData?.brickId && obj.parent) obj = obj.parent;
          return { kind: "brick", hit, brickObj: obj };
        }
        const planeHits = raycaster.intersectObject(rayPlane, false);
        if (planeHits.length > 0) {
          return { kind: "plane", hit: planeHits[0] };
        }
        return null;
      };

      const hitToGridTarget = (res, type, rot) => {
        if (!res) return null;
        const { w, d } = Bricks.getOrientedDims(type, rot);
        const pt = res.hit.point;
        const normal = res.hit.face ? res.hit.face.normal.clone().transformDirection(res.hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
        const target = pt.clone().addScaledVector(normal, 0.25);
        const gx = Math.floor(target.x - (w - 1) / 2);
        const gz = Math.floor(target.z - (d - 1) / 2);
        const minY = res.kind === "brick" ? Math.max(0, Math.floor(target.y / Bricks.LAYER_HEIGHT)) : 0;
        const clamped = Bricks.clampToBoard(type, gx, gz, rot);
        const gy = Bricks.findLandingY(bricksRef.current, type, clamped.gx, clamped.gz, rot, minY);
        if (gy < 0) return null;
        return { gx: clamped.gx, gy, gz: clamped.gz };
      };

      // 指针手势（单指旋转 / 双指缩放 / 轻点落砖）
      const activePointers = new Map();
      let downPos = null;
      let downTime = 0;
      let moved = false;
      let lastPinchDist = 0;

      const resetPointers = () => {
        activePointers.clear();
        downPos = null;
        downTime = 0;
        moved = false;
        lastPinchDist = 0;
        clearGhost();
      };

      const onPointerDown = (e) => {
        if (toolStateRef.current.uiBlocked) {
          resetPointers();
          return;
        }
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activePointers.size === 1) {
          downPos = { x: e.clientX, y: e.clientY };
          downTime = Date.now();
          moved = false;
        } else if (activePointers.size === 2) {
          moved = true;
          const pts = Array.from(activePointers.values());
          lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        }
      };

      const onPointerMove = (e) => {
        if (toolStateRef.current.uiBlocked) {
          resetPointers();
          return;
        }
        if (activePointers.has(e.pointerId)) {
          const prev = activePointers.get(e.pointerId);
          activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

          if (activePointers.size === 1 && downPos) {
            const dx = e.clientX - prev.x;
            const dy = e.clientY - prev.y;
            if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 7) moved = true;
            camState.theta -= dx * 0.0085;
            camState.phi = Math.max(0.24, Math.min(1.42, camState.phi - dy * 0.0075));
            updateCamera();
          } else if (activePointers.size === 2) {
            const pts = Array.from(activePointers.values());
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            if (lastPinchDist > 0) {
              camState.radius = Math.max(6, Math.min(24, camState.radius - (dist - lastPinchDist) * 0.035));
              updateCamera();
            }
            lastPinchDist = dist;
          }
          clearGhost();
          return;
        }

        // 桌面端悬停幽灵块预览
        const ts = toolStateRef.current;
        if (e.pointerType === "mouse" && !ts.viewing && ts.toolMode === "build") {
          const res = computeHit(e.clientX, e.clientY);
          const pos = hitToGridTarget(res, ts.selectedType, ts.selectedRot);
          clearGhost();
          if (pos) {
            ghostMesh = Bricks.createBrickMesh(THREE, {
              id: "__ghost__",
              type: ts.selectedType,
              gx: pos.gx,
              gy: pos.gy,
              gz: pos.gz,
              rot: ts.selectedRot,
              color: ts.selectedColor
            }, { ghost: true });
            scene.add(ghostMesh);
          }
        }
      };

      const onPointerUp = (e) => {
        if (toolStateRef.current.uiBlocked) {
          resetPointers();
          return;
        }
        const wasSingle = activePointers.size === 1;
        activePointers.delete(e.pointerId);
        if (activePointers.size < 2) lastPinchDist = 0;

        if (wasSingle && !moved && downPos && Date.now() - downTime < 360) {
          const ts = toolStateRef.current;
          if (ts.viewing) return;
          const res = computeHit(e.clientX, e.clientY);
          if (!res) return;

          if (ts.toolMode === "erase") {
            if (res.kind === "brick" && res.brickObj?.userData?.brickId) {
              const next = Bricks.removeBrick(bricksRef.current, res.brickObj.userData.brickId);
              commitBricks(next);
            }
            return;
          }

          const pos = hitToGridTarget(res, ts.selectedType, ts.selectedRot);
          if (!pos) return;
          const placed = Bricks.placeBrick(bricksRef.current, {
            type: ts.selectedType,
            gx: pos.gx,
            gz: pos.gz,
            rot: ts.selectedRot,
            color: ts.selectedColor,
            preferredMinY: pos.gy
          });
          if (placed.ok) {
            commitBricks(placed.bricks);
          } else {
            flashToast("已达最高层数上限");
          }
        }
      };

      const onWheel = (e) => {
        e.preventDefault();
        camState.radius = Math.max(6, Math.min(24, camState.radius + e.deltaY * 0.012));
        updateCamera();
      };

      const dom = renderer.domElement;
      dom.style.touchAction = "none";
      dom.addEventListener("pointerdown", onPointerDown);
      dom.addEventListener("pointermove", onPointerMove);
      dom.addEventListener("pointerup", onPointerUp);
      dom.addEventListener("pointercancel", onPointerUp);
      dom.addEventListener("pointerleave", clearGhost);
      dom.addEventListener("wheel", onWheel, { passive: false });

      const onResize = () => {
        const nw = container.clientWidth || global.innerWidth || 375;
        const nh = container.clientHeight || global.innerHeight || 667;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      global.addEventListener("resize", onResize);

      let rafId = 0;
      const animate = () => {
        rafId = requestAnimationFrame(animate);
        if (toolStateRef.current.viewing && activePointers.size === 0) {
          camState.theta += 0.0028;
          updateCamera();
        }
        renderer.render(scene, camera);
      };
      animate();

      sceneApiRef.current = {
        syncBricks: (list) => {
          while (bricksGroup.children.length) bricksGroup.remove(bricksGroup.children[0]);
          for (const b of list || []) {
            bricksGroup.add(Bricks.createBrickMesh(THREE, b));
          }
        },
        resetPointers
      };
      sceneApiRef.current.syncBricks(bricksRef.current);

      return () => {
        cancelAnimationFrame(rafId);
        global.removeEventListener("resize", onResize);
        dom.removeEventListener("pointerdown", onPointerDown);
        dom.removeEventListener("pointermove", onPointerMove);
        dom.removeEventListener("pointerup", onPointerUp);
        dom.removeEventListener("pointercancel", onPointerUp);
        dom.removeEventListener("pointerleave", clearGhost);
        dom.removeEventListener("wheel", onWheel);
        try { renderer.dispose(); } catch (e) {}
        Bricks.disposeCache();
        sceneApiRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (sceneApiRef.current) sceneApiRef.current.syncBricks(bricks);
    }, [bricks]);

    // 逐块落砖动画（用于展示名士谶纬积木或范例载入）
    const playBuildAnimation = (targetBricks) => {
      if (animTimerRef.current) clearInterval(animTimerRef.current);
      if (!Array.isArray(targetBricks) || !targetBricks.length) {
        setBricks([]);
        return;
      }
      setBricks([]);
      let idx = 0;
      animTimerRef.current = setInterval(() => {
        idx += 1;
        setBricks(targetBricks.slice(0, idx));
        if (idx >= targetBricks.length) {
          clearInterval(animTimerRef.current);
          animTimerRef.current = null;
        }
      }, 75);
    };

    // ==========================================
    // 4. 业务操作：玩家起卦 / 探查名士谶纬 / 指定名士解签与追问 / 分享传讯
    // ==========================================
    const resolveTriVerses = (item) => {
      if (!item) return { poem: "", ballad: "", chenyu: "", chenyuGloss: "" };
      const v = item.verses && typeof item.verses === "object" ? item.verses : null;
      if (v && (v.poem || v.ballad || v.chenyu)) {
        const fb = Oracle.buildOfflineTriVerses ? Oracle.buildOfflineTriVerses(item.analysis || {}, item.question || "") : {};
        return {
          poem: v.poem || item.oracleVerse || fb.poem || "",
          ballad: v.ballad || fb.ballad || "",
          chenyu: v.chenyu || fb.chenyu || "",
          chenyuGloss: item.chenyuGloss || fb.chenyuGloss || ""
        };
      }
      const fb = Oracle.buildOfflineTriVerses ? Oracle.buildOfflineTriVerses(item.analysis || {}, item.question || "") : {};
      return {
        poem: item.oracleVerse || fb.poem || "",
        ballad: fb.ballad || "",
        chenyu: fb.chenyu || "",
        chenyuGloss: item.chenyuGloss || fb.chenyuGloss || ""
      };
    };

    const handleTakeoverProphecy = (e) => {
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      if (animTimerRef.current) {
        clearInterval(animTimerRef.current);
        animTimerRef.current = null;
      }
      if (viewingCharProphecy && Array.isArray(viewingCharProphecy.bricks) && viewingCharProphecy.bricks.length) {
        setBricks(viewingCharProphecy.bricks);
      }
      if (sceneApiRef.current && typeof sceneApiRef.current.resetPointers === "function") {
        sceneApiRef.current.resetPointers();
      }
      setViewingCharProphecy(null);
      flashToast("已接手改造此积木，可自由增删零件");
    };

    const handleDivineNow = async () => {
      if (isDivining) return;
      if (!bricks.length) {
        flashToast("请先在玉坛上搭几块积木再起卦");
        return;
      }
      setIsDivining(true);
      try {
        const commChar = commentatorCharId ? characters.find((c) => String(c.id) === String(commentatorCharId)) : null;
        const res = await Oracle.requestPlayerDivination({
          question,
          bricks,
          commentatorChar: commChar || null
        });
        setActiveVerseForm("poem");
        setSelectedInterpCharId("");
        setFollowUpInput("");
        setRevealedMotiveMap({});
        setOracleResult(res);
        const latestRecs = await Oracle.loadOracleRecords(30);
        setRecords(latestRecs);
      } finally {
        setIsDivining(false);
      }
    };

    const handleSelectInterpretChar = async (charObj, forceRegen = false) => {
      const Interp = global.ChenweiCharInterpreter;
      if (!Interp || !oracleResult || !charObj) return;
      const cid = String(charObj.id);
      setSelectedInterpCharId(cid);
      const existing = oracleResult.interpretations && oracleResult.interpretations[cid];
      if (existing && !forceRegen) return;
      if (interpretingCharId === cid) return;

      const reqSeq = ++interpReqSeqRef.current;
      setInterpretingCharId(cid);
      try {
        const { updatedRecord } = await Interp.interpretOracleByCharacter({
          record: oracleResult,
          charObj
        });
        if (updatedRecord) {
          setOracleResult((prev) => (prev && prev.id === updatedRecord.id ? updatedRecord : prev));
          setRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
        }
        if (interpReqSeqRef.current === reqSeq) {
          setInterpretingCharId("");
        }
      } catch (err) {
        if (interpReqSeqRef.current === reqSeq) {
          setInterpretingCharId("");
          flashToast("名士解签失败，请稍后重试");
        }
      }
    };

    const handleSendFollowUp = async (customText = "") => {
      const Interp = global.ChenweiCharInterpreter;
      const qText = String(customText || followUpInput || "").trim();
      if (!Interp || !oracleResult || !selectedInterpCharId || !qText || sendingFollowUp) return;
      const charObj = characters.find((c) => String(c.id) === String(selectedInterpCharId));
      const curThread = oracleResult.interpretations && oracleResult.interpretations[selectedInterpCharId];
      if (!charObj || !curThread) return;

      setSendingFollowUp(true);
      setFollowUpInput("");
      try {
        const { updatedRecord } = await Interp.followUpOracleInterpretation({
          record: oracleResult,
          charObj,
          thread: curThread,
          userQuestion: qText
        });
        if (updatedRecord) {
          setOracleResult((prev) => (prev && prev.id === updatedRecord.id ? updatedRecord : prev));
          setRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
        }
      } catch (err) {
        flashToast("追问发送失败，请稍后再试");
      } finally {
        setSendingFollowUp(false);
      }
    };

    const handleInspectCharProphecy = async (charObj, forceRegenerate = false) => {
      const cid = String(charObj.id);
      const cached = charProphecies[cid];
      if (cached && !forceRegenerate) {
        setProphecyVerseForm("poem");
        setViewingCharProphecy(cached);
        setProphecyCardExpanded(true);
        setSidebarOpen(false);
        playBuildAnimation(cached.bricks || []);
        return;
      }
      setLoadingCharId(cid);
      try {
        const prop = await Oracle.requestCharacterProphecy(charObj);
        setCharProphecies((prev) => ({ ...prev, [cid]: prop }));
        setProphecyVerseForm("poem");
        setViewingCharProphecy(prop);
        setProphecyCardExpanded(true);
        setSidebarOpen(false);
        playBuildAnimation(prop.bricks || []);
      } catch (e) {
        flashToast("探查名士谶纬失败，请稍后重试");
      } finally {
        setLoadingCharId("");
      }
    };

    const handleOpenShareModal = ({ record, activeThread = null, sourceKind = "player", defaultCharId = "" }) => {
      if (!record) return;
      if (!characters.length) {
        flashToast("传讯中暂无可抄送的名士");
        return;
      }
      setShareNoteInput("");
      setShareModalPayload({ record, activeThread, sourceKind, defaultCharId: String(defaultCharId || "") });
    };

    const handleConfirmShareToChar = async (targetChar) => {
      if (!shareModalPayload || !targetChar || sharingCharId) return;
      const CardEngine = global.ChenweiChatCardEngine;
      if (!CardEngine || typeof CardEngine.sendChenweiCardToChat !== "function") {
        flashToast("传讯卡片引擎未就绪");
        return;
      }
      setSharingCharId(String(targetChar.id));
      try {
        const res = await CardEngine.sendChenweiCardToChat({
          targetChar,
          record: shareModalPayload.record,
          activeThread: shareModalPayload.activeThread,
          sourceKind: shareModalPayload.sourceKind,
          note: shareNoteInput
        });
        if (res && res.ok) {
          setShareModalPayload(null);
          setShareNoteInput("");
          flashToast(`已将卦签卡片抄送至「${targetChar.name}」传讯主线`);
        } else {
          flashToast("抄送失败，请稍后重试");
        }
      } catch (e) {
        flashToast("抄送失败");
      } finally {
        setSharingCharId("");
      }
    };

    const curBrickDef = Bricks.BRICK_MAP[selectedType] || Bricks.BRICK_CATALOG[0];
    const curColorDef = Bricks.COLOR_MAP[selectedColor] || Bricks.COLOR_PALETTE[0];
    const filteredBricks = Bricks.BRICK_CATALOG.filter((b) => b.cat === activeBrickCat);

    // ==========================================
    // 5. 极简居中画布 + 可折叠 4 页签侧边栏渲染
    // ==========================================
    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99990,
          background: "#F4EFE6",
          color: "#3E342B",
          fontFamily: "'Noto Serif SC', 'Songti SC', serif",
          overflow: "hidden",
          userSelect: "none"
        }
      },
      // 中央 100% 3D 乐高画布容器（显式层级 + 弹窗/侧边栏开启时自动熔断指针，根治手机端 WebGL 触摸抢占）
      h("div", {
        ref: canvasMountRef,
        style: {
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
          isolation: "isolate",
          pointerEvents: (sidebarOpen || !!oracleResult) ? "none" : "auto"
        }
      }),

      // 顶部极简浮栏
      h(
        "div",
        {
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            padding: "calc(10px + env(safe-area-inset-top, 0px)) 12px 8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pointerEvents: "none",
            zIndex: 30,
            transform: "translateZ(0)",
            WebkitTransform: "translateZ(0)"
          }
        },
        h(
          "button",
          {
            type: "button",
            onClick: onBack,
            style: {
              pointerEvents: "auto",
              touchAction: "manipulation",
              border: "1px solid rgba(139,115,85,0.22)",
              background: "rgba(255,252,246,0.92)",
              color: "#4A3C31",
              borderRadius: "12px",
              width: "36px",
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(62,52,43,0.08)",
              cursor: "pointer"
            }
          },
          SvgIcon(h, "back", { size: 18, color: "#4A3C31" })
        ),
        h(
          "div",
          {
            style: {
              pointerEvents: "auto",
              background: "rgba(255,252,246,0.92)",
              border: "1px solid rgba(139,115,85,0.2)",
              borderRadius: "999px",
              padding: "6px 14px",
              boxShadow: "0 4px 14px rgba(62,52,43,0.08)",
              display: "flex",
              alignItems: "center",
              gap: "7px",
              fontSize: "13px",
              fontWeight: 800,
              color: "#3E342B"
            }
          },
          SvgIcon(h, "oracle", { size: 16, color: "#B84A39" }),
          h("span", null, viewingCharProphecy ? `${viewingCharProphecy.charName} · ${viewingCharProphecy.buildTitle}` : `谶纬小摊 · ${bricks.length} 块`)
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () => setSidebarOpen((v) => !v),
            style: {
              pointerEvents: "auto",
              touchAction: "manipulation",
              border: "1px solid rgba(139,115,85,0.22)",
              background: sidebarOpen ? "#4A3C31" : "rgba(255,252,246,0.92)",
              color: sidebarOpen ? "#FFFDF7" : "#4A3C31",
              borderRadius: "12px",
              width: "36px",
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(62,52,43,0.08)",
              cursor: "pointer"
            }
          },
          SvgIcon(h, "sidebar", { size: 18, color: sidebarOpen ? "#FFFDF7" : "#4A3C31" })
        )
      ),

      // 左侧极简悬浮编辑小圆钮（独立合成层 + touchAction，防止移动端接手改造后失灵）
      !viewingCharProphecy &&
        h(
          "div",
          {
            style: {
              position: "absolute",
              left: "12px",
              top: "calc(62px + env(safe-area-inset-top, 0px))",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              zIndex: 30,
              pointerEvents: "auto",
              transform: "translateZ(0)",
              WebkitTransform: "translateZ(0)"
            }
          },
          [
            { id: "undo", icon: "undo", active: false, disabled: !undoStack.length, onClick: handleUndo, title: "撤销" },
            { id: "redo", icon: "redo", active: false, disabled: !redoStack.length, onClick: handleRedo, title: "重做" },
            { id: "rot",  icon: "rotate", active: false, disabled: false, onClick: () => { setSelectedRot((r) => (r + 90) % 360); flashToast(`已旋转至 ${(selectedRot + 90) % 360}°`); }, title: "旋转90°" },
            { id: "erase",icon: "eraser", active: toolMode === "erase", disabled: false, onClick: () => setToolMode((m) => (m === "erase" ? "build" : "erase")), title: "拆砖模式" },
            { id: "clear",icon: "clear", active: false, disabled: !bricks.length, onClick: () => commitBricks([]), title: "清空玉坛" }
          ].map((btn) =>
            h(
              "button",
              {
                key: btn.id,
                type: "button",
                title: btn.title,
                disabled: btn.disabled,
                onClick: btn.onClick,
                style: {
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  touchAction: "manipulation",
                  border: btn.active ? "1.5px solid #C84B31" : "1px solid rgba(139,115,85,0.22)",
                  background: btn.active ? "#C84B31" : "rgba(255,252,246,0.92)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 3px 10px rgba(62,52,43,0.08)",
                  opacity: btn.disabled ? 0.38 : 1,
                  cursor: btn.disabled ? "not-allowed" : "pointer"
                }
              },
              SvgIcon(h, btn.icon, { size: 17, color: btn.active ? "#FFFFFF" : "#4A3C31" })
            )
          )
        ),

      // Toast 轻提示（显式 pointerEvents: none 不阻挡点击）
      toast &&
        h(
          "div",
          {
            style: {
              position: "absolute",
              top: "calc(58px + env(safe-area-inset-top, 0px))",
              left: "50%",
              transform: "translateX(-50%) translateZ(0)",
              WebkitTransform: "translateX(-50%) translateZ(0)",
              zIndex: 80,
              pointerEvents: "none",
              background: "rgba(62,52,43,0.92)",
              color: "#FFFDF7",
              padding: "6px 14px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: 600,
              whiteSpace: "nowrap"
            }
          },
          toast
        ),

      // 底部区域：自建模式为极简「所问何事 + 起卦」浮条；观摩名士模式为「名士谶纬手札卡片」
      viewingCharProphecy
        ? (() => {
            const pTri = resolveTriVerses(viewingCharProphecy);
            const pForms = Oracle.ORACLE_FORMS || [
              { id: "poem", label: "古诗签" },
              { id: "ballad", label: "东汉童谣" },
              { id: "chenyu", label: "图谶秘语" }
            ];
            return h(
              "div",
              {
                style: {
                  position: "absolute",
                  left: "12px",
                  right: "12px",
                  bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
                  zIndex: 30,
                  transform: "translateZ(0)",
                  WebkitTransform: "translateZ(0)",
                  background: "rgba(255,252,246,0.96)",
                  border: "1px solid rgba(184,155,114,0.38)",
                  borderRadius: "18px",
                  padding: "12px 14px",
                  boxShadow: "0 10px 30px rgba(62,52,43,0.14)",
                  maxHeight: prophecyCardExpanded ? "48%" : "58px",
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  touchAction: "pan-y",
                  transition: "max-height 0.2s ease"
                }
              },
              h(
                "div",
                {
                  onClick: () => setProphecyCardExpanded((v) => !v),
                  style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", cursor: "pointer" }
                },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 } },
                  avatarMap[viewingCharProphecy.charId]
                    ? h("img", { src: avatarMap[viewingCharProphecy.charId], alt: viewingCharProphecy.charName, style: { width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover", border: "1.5px solid #D4A03C" } })
                    : h("div", { style: { width: "32px", height: "32px", borderRadius: "50%", background: "#D9C7B2", color: "#3E342B", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "13px" } }, viewingCharProphecy.charName.slice(0, 1)),
                  h(
                    "div",
                    { style: { minWidth: 0 } },
                    h("div", { style: { fontSize: "13.5px", fontWeight: 800, color: "#3E342B" } }, `${viewingCharProphecy.charName} · ${viewingCharProphecy.hexagram}`),
                    h("div", { style: { fontSize: "11px", color: "#8C7A68", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, `暗问：${viewingCharProphecy.question}`)
                  )
                ),
                h("span", { style: { fontSize: "11px", color: "#B84A39", fontWeight: 700, flexShrink: 0 } }, prophecyCardExpanded ? "收起" : "展开")
              ),
              prophecyCardExpanded &&
                h(
                  "div",
                  { style: { marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12.5px", lineHeight: 1.65 } },
                  // 三体裁切换按钮
                  h(
                    "div",
                    { style: { display: "flex", gap: "5px" } },
                    pForms.map((fm) => {
                      const act = prophecyVerseForm === fm.id;
                      return h("button", {
                        key: fm.id,
                        type: "button",
                        onClick: () => setProphecyVerseForm(fm.id),
                        style: {
                          flex: 1,
                          touchAction: "manipulation",
                          border: act ? "1px solid #C84B31" : "1px solid #E2D5C0",
                          background: act ? "#C84B31" : "#F7F1E5",
                          color: act ? "#FFFDF7" : "#5C4738",
                          borderRadius: "8px",
                          padding: "4px 6px",
                          fontSize: "11px",
                          fontWeight: 700,
                          cursor: "pointer"
                        }
                      }, fm.label);
                    })
                  ),
                  h(
                    "div",
                    {
                      style: {
                        background: "#F8F3EA",
                        borderLeft: "3px solid #C84B31",
                        padding: "7px 10px",
                        borderRadius: "6px",
                        whiteSpace: "pre-line",
                        color: "#5C4738",
                        fontWeight: 600,
                        textAlign: prophecyVerseForm === "ballad" ? "center" : "left"
                      }
                    },
                    pTri[prophecyVerseForm] || pTri.poem
                  ),
                  prophecyVerseForm === "chenyu" && pTri.chenyuGloss &&
                    h("div", { style: { fontSize: "11px", color: "#8C6239", background: "#FBF5E8", border: "1px dashed #DEC597", borderRadius: "6px", padding: "5px 8px" } }, pTri.chenyuGloss),
                  h("div", { style: { color: "#3E342B" } }, viewingCharProphecy.charNote),
                  h(
                    "div",
                    { style: { display: "flex", gap: "8px", paddingTop: "4px" } },
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: () => {
                          const cObj = characters.find((c) => String(c.id) === String(viewingCharProphecy.charId));
                          if (cObj) handleInspectCharProphecy(cObj, true);
                        },
                        style: { flex: 1, touchAction: "manipulation", padding: "8px", borderRadius: "10px", border: "1px solid #D5C5B0", background: "#FFF", color: "#4A3C31", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", cursor: "pointer" }
                      },
                      SvgIcon(h, "refresh", { size: 14, color: "#4A3C31" }),
                      "重新起卦"
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: () => handleOpenShareModal({
                          record: viewingCharProphecy,
                          sourceKind: "char",
                          defaultCharId: viewingCharProphecy.charId
                        }),
                        style: { flex: 1, touchAction: "manipulation", padding: "8px", borderRadius: "10px", border: "1px solid #D5C5B0", background: "#FFF", color: "#4A3C31", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", cursor: "pointer" }
                      },
                      SvgIcon(h, "share", { size: 13, color: "#4A3C31" }),
                      "抄送名士"
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: handleTakeoverProphecy,
                        style: { flex: 1, touchAction: "manipulation", padding: "8px", borderRadius: "10px", border: "none", background: "#C84B31", color: "#FFF", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", cursor: "pointer" }
                      },
                      SvgIcon(h, "takeover", { size: 14, color: "#FFF" }),
                      "接手改造"
                    )
                  )
                )
            );
          })()
        : h(
            "div",
            {
              style: {
                position: "absolute",
                left: "12px",
                right: "12px",
                bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
                zIndex: 30,
                transform: "translateZ(0)",
                WebkitTransform: "translateZ(0)",
                background: "rgba(255,252,246,0.95)",
                border: "1px solid rgba(184,155,114,0.35)",
                borderRadius: "999px",
                padding: "6px 7px 6px 8px",
                boxShadow: "0 8px 26px rgba(62,52,43,0.12)",
                display: "flex",
                alignItems: "center",
                gap: "7px"
              }
            },
            // 当前积木快捷按钮（点开侧边栏积木页）
            h(
              "button",
              {
                type: "button",
                onClick: () => { setSidebarTab("bricks"); setSidebarOpen(true); },
                style: {
                  border: "1px solid rgba(139,115,85,0.25)",
                  background: "#F7F2E8",
                  borderRadius: "999px",
                  padding: "4px 8px 4px 5px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                  flexShrink: 0
                }
              },
              BrickShapeSvg(h, curBrickDef.shape, curColorDef.hex, 22),
              h("span", { style: { fontSize: "11px", fontWeight: 700, color: "#4A3C31" } }, curBrickDef.name.split(" ")[0])
            ),
            h("input", {
              type: "text",
              value: question,
              onChange: (e) => setQuestion(e.target.value),
              onKeyDown: (e) => e.key === "Enter" && handleDivineNow(),
              placeholder: "心中所问何事，落砖即可起卦…",
              style: {
                flex: 1,
                minWidth: 0,
                border: "none",
                background: "transparent",
                fontSize: "13px",
                color: "#3E342B",
                outline: "none",
                fontFamily: "inherit"
              }
            }),
            h(
              "button",
              {
                type: "button",
                disabled: isDivining,
                onClick: handleDivineNow,
                style: {
                  border: "none",
                  borderRadius: "999px",
                  background: isDivining ? "#B8A58D" : "linear-gradient(135deg, #C84B31 0%, #9E3420 100%)",
                  color: "#FFFDF7",
                  padding: "8px 14px",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  cursor: isDivining ? "wait" : "pointer",
                  flexShrink: 0
                }
              },
              SvgIcon(h, "oracle", { size: 15, color: "#FFFDF7" }),
              isDivining ? "推演中" : "起卦"
            )
          ),

      // ==========================================
      // 6. 可折叠多功能侧边栏（积木 / 名士 / 卷宗 / 简介，独立合成层防移动端穿透）
      // ==========================================
      sidebarOpen &&
        h(
          "div",
          {
            onClick: (e) => { if (e.target === e.currentTarget) setSidebarOpen(false); },
            style: {
              position: "fixed",
              inset: 0,
              zIndex: 60,
              transform: "translateZ(0)",
              WebkitTransform: "translateZ(0)",
              background: "rgba(44,36,28,0.34)",
              display: "flex",
              justifyContent: "flex-end",
              pointerEvents: "auto"
            }
          },
          h(
            "div",
            {
              onClick: (e) => e.stopPropagation(),
              style: {
                position: "relative",
                zIndex: 2,
                width: "84%",
                maxWidth: "330px",
                height: "100%",
                background: "#FAF6EE",
                boxShadow: "-8px 0 30px rgba(44,36,28,0.18)",
                display: "flex",
                flexDirection: "column",
                pointerEvents: "auto",
                touchAction: "pan-y",
                transform: "translateZ(0)",
                WebkitTransform: "translateZ(0)",
                paddingTop: "env(safe-area-inset-top, 0px)",
                paddingBottom: "env(safe-area-inset-bottom, 0px)"
              }
            },
            // 侧边栏顶栏 + 4 矢量图标页签
            h(
              "div",
              { style: { padding: "12px 12px 10px", borderBottom: "1px solid #E8DEC8", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" } },
              h(
                "div",
                { style: { display: "flex", gap: "4px", flex: 1 } },
                [
                  { id: "bricks",  icon: "tab_bricks",  label: "积木" },
                  { id: "chars",   icon: "tab_chars",   label: "名士" },
                  { id: "records", icon: "tab_records", label: "卷宗" },
                  { id: "info",    icon: "tab_info",    label: "简介" }
                ].map((t) => {
                  const act = sidebarTab === t.id;
                  return h(
                    "button",
                    {
                      key: t.id,
                      type: "button",
                      onClick: () => setSidebarTab(t.id),
                      style: {
                        flex: 1,
                        border: "none",
                        borderRadius: "10px",
                        padding: "7px 2px",
                        background: act ? "#4A3C31" : "#EFE8DA",
                        color: act ? "#FFFDF7" : "#6B5A49",
                        fontSize: "11px",
                        fontWeight: 700,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "3px",
                        cursor: "pointer"
                      }
                    },
                    SvgIcon(h, t.icon, { size: 16, color: act ? "#FFFDF7" : "#6B5A49" }),
                    t.label
                  );
                })
              ),
              h(
                "button",
                {
                  type: "button",
                  onClick: () => setSidebarOpen(false),
                  style: { border: "none", background: "transparent", padding: "6px", cursor: "pointer" }
                },
                SvgIcon(h, "close", { size: 18, color: "#6B5A49" })
              )
            ),

            // 侧边栏内容滚动区
            h(
              "div",
              { style: { flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "12px" } },
              // 页签 1：乐高积木零件库 + 五行色板 + 范例
              sidebarTab === "bricks" &&
                h(
                  React.Fragment,
                  null,
                  // 8 色五行色板
                  h(
                    "div",
                    null,
                    h("div", { style: { fontSize: "12px", fontWeight: 800, color: "#5C4738", marginBottom: "8px" } }, `五行釉色 · ${curColorDef.name}（${curColorDef.element}）`),
                    h(
                      "div",
                      { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "7px" } },
                      Bricks.COLOR_PALETTE.map((col) => {
                        const act = selectedColor === col.id;
                        return h(
                          "button",
                          {
                            key: col.id,
                            type: "button",
                            onClick: () => { setSelectedColor(col.id); setToolMode("build"); },
                            style: {
                              border: act ? "2px solid #3E342B" : "1px solid #DFD3BE",
                              background: "#FFFDF8",
                              borderRadius: "10px",
                              padding: "6px 4px",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: "4px",
                              cursor: "pointer"
                            }
                          },
                          h("span", { style: { width: "22px", height: "22px", borderRadius: "50%", background: col.hex, border: "1px solid rgba(0,0,0,0.12)" } }),
                          h("span", { style: { fontSize: "10.5px", fontWeight: 700, color: "#4A3C31" } }, `${col.name.slice(0, 2)}·${col.element}`)
                        );
                      })
                    )
                  ),
                  // 5 类零件分类条
                  h(
                    "div",
                    { style: { display: "flex", gap: "5px" } },
                    Bricks.BRICK_CATEGORIES.map((cat) =>
                      h(
                        "button",
                        {
                          key: cat.id,
                          type: "button",
                          onClick: () => setActiveBrickCat(cat.id),
                          style: {
                            flex: 1,
                            border: "none",
                            borderRadius: "8px",
                            padding: "6px 2px",
                            fontSize: "11.5px",
                            fontWeight: 700,
                            background: activeBrickCat === cat.id ? "#C84B31" : "#EFE8DA",
                            color: activeBrickCat === cat.id ? "#FFF" : "#5C4738",
                            cursor: "pointer"
                          }
                        },
                        cat.name
                      )
                    )
                  ),
                  // 零件网格（手绘乐高矢量小图）
                  h(
                    "div",
                    { style: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" } },
                    filteredBricks.map((part) => {
                      const act = selectedType === part.id && toolMode === "build";
                      return h(
                        "button",
                        {
                          key: part.id,
                          type: "button",
                          onClick: () => {
                            setSelectedType(part.id);
                            setToolMode("build");
                            setViewingCharProphecy(null);
                          },
                          style: {
                            border: act ? "2px solid #C84B31" : "1px solid #E5D9C4",
                            background: act ? "#FFF7F4" : "#FFFDF8",
                            borderRadius: "12px",
                            padding: "8px",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            textAlign: "left",
                            cursor: "pointer"
                          }
                        },
                        BrickShapeSvg(h, part.shape, curColorDef.hex, 30),
                        h(
                          "div",
                          { style: { minWidth: 0 } },
                          h("div", { style: { fontSize: "12px", fontWeight: 800, color: "#3E342B" } }, part.name),
                          h("div", { style: { fontSize: "10px", color: "#8C7A68" } }, part.meaning)
                        )
                      );
                    })
                  ),
                  // 经典范例一键载入
                  h(
                    "div",
                    { style: { borderTop: "1px solid #E8DEC8", paddingTop: "10px" } },
                    h("div", { style: { fontSize: "12px", fontWeight: 800, color: "#5C4738", marginBottom: "8px" } }, "一键经典筑台范例"),
                    h(
                      "div",
                      { style: { display: "flex", gap: "6px" } },
                      Bricks.PRESET_BUILDS.map((pr) =>
                        h(
                          "button",
                          {
                            key: pr.id,
                            type: "button",
                            onClick: () => {
                              setViewingCharProphecy(null);
                              playBuildAnimation(pr.build());
                              setSidebarOpen(false);
                            },
                            style: { flex: 1, border: "1px solid #DECFA8", background: "#FFFDF8", borderRadius: "10px", padding: "8px 4px", fontSize: "11.5px", fontWeight: 700, color: "#4A3C31", cursor: "pointer" }
                          },
                          pr.name
                        )
                      )
                    )
                  ),
                  // 可选同行解签点评名士
                  characters.length > 0 &&
                    h(
                      "div",
                      { style: { borderTop: "1px solid #E8DEC8", paddingTop: "10px" } },
                      h("div", { style: { fontSize: "12px", fontWeight: 800, color: "#5C4738", marginBottom: "6px" } }, "起卦时邀请一位名士点评（可选）"),
                      h(
                        "select",
                        {
                          value: commentatorCharId,
                          onChange: (e) => setCommentatorCharId(e.target.value),
                          style: { width: "100%", padding: "8px 10px", borderRadius: "10px", border: "1px solid #DDD0B8", background: "#FFFDF8", fontSize: "12.5px", color: "#3E342B", fontFamily: "inherit" }
                        },
                        h("option", { value: "" }, "仅由司天监先生解签"),
                        characters.map((c) => h("option", { key: c.id, value: String(c.id) }, `邀「${c.name}」同观卦象`))
                      )
                    )
                ),

              // 页签 2：查看名士的谶纬情况（5 维人设 + ≥30 条传讯）
              sidebarTab === "chars" &&
                h(
                  React.Fragment,
                  null,
                  h("div", { style: { fontSize: "11.5px", color: "#7D6B59", lineHeight: 1.55, background: "#F3ECE0", padding: "8px 10px", borderRadius: "10px" } },
                    "点击任一名士，系统将合参其角色档案、你的身份库、世界书及近 30+ 条传讯对话，在中央玉坛搭出 TA 专属的 3D 乐高谶纬。"
                  ),
                  viewingCharProphecy &&
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: () => { setViewingCharProphecy(null); setSidebarOpen(false); },
                        style: { width: "100%", padding: "9px", borderRadius: "10px", border: "1px solid #C84B31", background: "#FFF7F4", color: "#C84B31", fontSize: "12.5px", fontWeight: 800, cursor: "pointer" }
                      },
                      "返回「我的积木」继续拼装"
                    ),
                  h(
                    "div",
                    { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                    characters.map((c) => {
                      const cid = String(c.id);
                      const av = avatarMap[cid];
                      const cached = charProphecies[cid];
                      const isLoading = loadingCharId === cid;
                      return h(
                        "div",
                        {
                          key: cid,
                          onClick: () => !isLoading && handleInspectCharProphecy(c, false),
                          style: {
                            background: "#FFFDF8",
                            border: viewingCharProphecy?.charId === cid ? "2px solid #C84B31" : "1px solid #E5D9C4",
                            borderRadius: "14px",
                            padding: "10px",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            cursor: isLoading ? "wait" : "pointer"
                          }
                        },
                        av
                          ? h("img", { src: av, alt: c.name, style: { width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 } })
                          : h("div", { style: { width: "40px", height: "40px", borderRadius: "50%", background: "#DFCBB5", color: "#3E342B", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 } }, c.name.slice(0, 1)),
                        h(
                          "div",
                          { style: { flex: 1, minWidth: 0 } },
                          h("div", { style: { fontSize: "13px", fontWeight: 800, color: "#3E342B" } }, c.name),
                          h("div", { style: { fontSize: "11px", color: "#8C7A68", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: "2px" } },
                            isLoading ? "正在推演 TA 的 3D 积木与手札…" : cached ? `${cached.buildTitle} · ${cached.hexagram}` : "点击探查 TA 的谶纬积木"
                          )
                        ),
                        SvgIcon(h, "oracle", { size: 18, color: cached ? "#C84B31" : "#B8A58D" })
                      );
                    })
                  )
                ),

              // 页签 3：历史卦卷（IDB 持久化）
              sidebarTab === "records" &&
                (records.length === 0
                  ? h("div", { style: { textAlign: "center", padding: "36px 12px", color: "#8C7A68", fontSize: "12.5px" } }, "尚未留存卦卷，搭好积木并在底部输入所问即可起卦。")
                  : h(
                      "div",
                      { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                      records.map((rec) =>
                        h(
                          "div",
                          {
                            key: rec.id,
                            onClick: () => {
                              setViewingCharProphecy(null);
                              if (Array.isArray(rec.bricks) && rec.bricks.length) playBuildAnimation(rec.bricks);
                              setActiveVerseForm("poem");
                              const firstInterpId = rec.interpretations ? Object.keys(rec.interpretations)[0] || "" : "";
                              setSelectedInterpCharId(firstInterpId);
                              setFollowUpInput("");
                              setRevealedMotiveMap({});
                              setOracleResult(rec);
                              setSidebarOpen(false);
                            },
                            style: { background: "#FFFDF8", border: "1px solid #E5D9C4", borderRadius: "12px", padding: "10px", cursor: "pointer" }
                          },
                          h("div", { style: { fontSize: "13px", fontWeight: 800, color: "#C84B31" } }, rec.hexagram),
                          h("div", { style: { fontSize: "11.5px", color: "#4A3C31", marginTop: "3px" } }, `所问：${rec.question}`),
                          h("div", { style: { fontSize: "10.5px", color: "#8C7A68", marginTop: "4px" } }, `${(rec.bricks || []).length} 块积木 · 点击复原 3D 现场`)
                        )
                      )
                    )),

              // 页签 4：简介与操作速查（所有介绍类内容统一归纳于此）
              sidebarTab === "info" &&
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "10px", fontSize: "12.5px", lineHeight: 1.7, color: "#4A3C31" } },
                  h(
                    "div",
                    { style: { background: "#FFFDF8", border: "1px solid #E5D9C4", borderRadius: "14px", padding: "12px" } },
                    h("div", { style: { fontSize: "13.5px", fontWeight: 800, color: "#C84B31", marginBottom: "6px" } }, "谶纬小摊 · 筑石观象"),
                    "汉代谶纬讲究「器以载道，象由心生」。你在此处亲手拼搭的每一块乐高积木，其层高、对称、重心稳度、五行釉色与灵物法器，都会化作真实卦象物证，由司天监掌卦先生（或特邀名士）为你解签。"
                  ),
                  h(
                    "div",
                    { style: { background: "#FFFDF8", border: "1px solid #E5D9C4", borderRadius: "14px", padding: "12px" } },
                    h("div", { style: { fontSize: "13px", fontWeight: 800, color: "#3E342B", marginBottom: "6px" } }, "拼装手势指南"),
                    h("div", { style: { whiteSpace: "pre-line", fontSize: "12px", color: "#6B5A49" } },
                      "• 轻点玉坛底板或积木表面：自动网格吸附落砖\n• 单指拖动：360° 旋转观赏视角\n• 双指捏合 / 滚轮：缩放镜头远近\n• 左侧小圆钮：撤销、重做、旋转 90°、切换拆砖模式\n• 侧边栏「名士」：探查任意传讯名士结合近 30+ 条聊天搭出的专属谶纬积木"
                    )
                  ),
                  h(
                    "div",
                    { style: { background: "#FFFDF8", border: "1px solid #E5D9C4", borderRadius: "14px", padding: "12px" } },
                    h("div", { style: { fontSize: "13px", fontWeight: 800, color: "#3E342B", marginBottom: "6px" } }, "五行釉色象意"),
                    Bricks.COLOR_PALETTE.map((c) =>
                      h("div", { key: c.id, style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", fontSize: "11.5px" } },
                        h("span", { style: { width: "12px", height: "12px", borderRadius: "50%", background: c.hex, flexShrink: 0 } }),
                        h("strong", null, `${c.name}（${c.element}）`),
                        h("span", { style: { color: "#7D6B59" } }, c.meaning)
                      )
                    )
                  )
                )
            )
          )
        ),

      // ==========================================
      // 7. 玩家解签结果浮窗（三体裁一键切换 + 指定名士解签博弈 + 多轮追问）
      // ==========================================
      oracleResult &&
        (() => {
          const tri = resolveTriVerses(oracleResult);
          const forms = Oracle.ORACLE_FORMS || [
            { id: "poem", label: "古诗签", seal: "诗签", subtitle: "四言/五言/七言绝句" },
            { id: "ballad", label: "东汉童谣", seal: "童谣", subtitle: "巷陌歌谣 · 隐喻时局" },
            { id: "chenyu", label: "图谶秘语", seal: "图谶", subtitle: "河图纬书 · 拆字象数" }
          ];
          const curFormMeta = forms.find((f) => f.id === activeVerseForm) || forms[0];
          const Interp = global.ChenweiCharInterpreter;
          const interpMap = (oracleResult.interpretations && typeof oracleResult.interpretations === "object") ? oracleResult.interpretations : {};
          const activeCharObj = selectedInterpCharId ? characters.find((c) => String(c.id) === String(selectedInterpCharId)) : null;
          const activeThread = selectedInterpCharId ? interpMap[selectedInterpCharId] : null;
          const isCharBusy = Boolean(interpretingCharId && interpretingCharId === selectedInterpCharId);

          return h(
            "div",
            {
              onClick: (e) => { if (e.target === e.currentTarget) setOracleResult(null); },
              style: {
                position: "fixed",
                inset: 0,
                zIndex: 70,
                transform: "translateZ(0)",
                WebkitTransform: "translateZ(0)",
                background: "rgba(44,36,28,0.46)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "14px",
                pointerEvents: "auto"
              }
            },
            h(
              "div",
              {
                onClick: (e) => e.stopPropagation(),
                style: {
                  width: "100%",
                  maxWidth: "372px",
                  maxHeight: "86vh",
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  touchAction: "pan-y",
                  background: "#FAF6EE",
                  border: "1.5px solid #D4A03C",
                  borderRadius: "20px",
                  padding: "15px",
                  boxShadow: "0 16px 40px rgba(44,36,28,0.28)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }
              },
              // 顶部卦名与关闭
              h(
                "div",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "15px", fontWeight: 900, color: "#C84B31" } },
                  SvgIcon(h, "oracle", { size: 18, color: "#C84B31" }),
                  oracleResult.hexagram
                ),
                h("button", { type: "button", onClick: () => setOracleResult(null), style: { border: "none", background: "transparent", cursor: "pointer", padding: "4px", touchAction: "manipulation" } }, SvgIcon(h, "close", { size: 18, color: "#6B5A49" }))
              ),
              h("div", { style: { fontSize: "12px", color: "#7D6B59" } }, `所问：${oracleResult.question}`),

              // 东汉三体裁切换按钮（古诗签 / 东汉童谣 / 图谶秘语）
              h(
                "div",
                { style: { display: "flex", gap: "6px", background: "#EFE7D8", padding: "4px", borderRadius: "11px" } },
                forms.map((fm) => {
                  const act = activeVerseForm === fm.id;
                  return h(
                    "button",
                    {
                      key: fm.id,
                      type: "button",
                      onClick: () => setActiveVerseForm(fm.id),
                      style: {
                        flex: 1,
                        touchAction: "manipulation",
                        border: "none",
                        borderRadius: "8px",
                        padding: "6px 4px",
                        fontSize: "11.5px",
                        fontWeight: 800,
                        background: act ? "#C84B31" : "transparent",
                        color: act ? "#FFFDF7" : "#5C4738",
                        boxShadow: act ? "0 2px 6px rgba(200,75,49,0.25)" : "none",
                        cursor: "pointer"
                      }
                    },
                    fm.label
                  );
                })
              ),

              // 当前体裁签文展示框
              h(
                "div",
                {
                  style: {
                    background: activeVerseForm === "chenyu" ? "#FFF9F0" : "#FFFDF8",
                    border: activeVerseForm === "chenyu" ? "1px solid #DEC292" : "1px solid #EAE0CE",
                    borderLeft: "3.5px solid #C84B31",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px"
                  }
                },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                  h("span", { style: { fontSize: "10.5px", color: "#9C7A54", fontWeight: 700 } }, curFormMeta.subtitle || curFormMeta.label),
                  h("span", { style: { fontSize: "10px", fontWeight: 800, color: "#C84B31", border: "1px solid rgba(200,75,49,0.45)", borderRadius: "4px", padding: "1px 5px" } }, curFormMeta.seal || curFormMeta.label)
                ),
                h(
                  "div",
                  {
                    style: {
                      whiteSpace: "pre-line",
                      fontSize: activeVerseForm === "ballad" ? "13.5px" : "13.5px",
                      fontWeight: 700,
                      lineHeight: 1.8,
                      color: "#3E342B",
                      textAlign: activeVerseForm === "ballad" ? "center" : "left",
                      letterSpacing: activeVerseForm === "chenyu" ? "0.6px" : "0.2px"
                    }
                  },
                  tri[activeVerseForm] || tri.poem
                ),
                activeVerseForm === "chenyu" && tri.chenyuGloss &&
                  h(
                    "div",
                    { style: { fontSize: "11.5px", lineHeight: 1.55, color: "#7B5630", background: "#F8EEDB", borderRadius: "7px", padding: "6px 8px", border: "1px dashed #D8B884" } },
                    tri.chenyuGloss
                  )
              ),

              h("div", { style: { fontSize: "12.5px", lineHeight: 1.7, color: "#4A3C31" } }, oracleResult.structureReading),
              h("div", { style: { background: "#F2EAE0", borderRadius: "10px", padding: "9px 11px", fontSize: "12px", lineHeight: 1.65, color: "#5C4738" } }, `建言：${oracleResult.advice}`),
              oracleResult.charComment &&
                h("div", { style: { background: "#FFF7F4", border: "1px solid #F0C9BD", borderRadius: "10px", padding: "9px 11px", fontSize: "12px", lineHeight: 1.65, color: "#6E2E22" } },
                  h("strong", null, `${oracleResult.commentatorName || "名士"}附评：`),
                  oracleResult.charComment
                ),

              // ==========================================
              // 指定名士解签 + 善/恶意谎言博弈 + 多轮追问区
              // ==========================================
              Interp && characters.length > 0 &&
                h(
                  "div",
                  { style: { borderTop: "1px dashed #DFD1B8", paddingTop: "10px", display: "flex", flexDirection: "column", gap: "8px" } },
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                    h("span", { style: { fontSize: "12.5px", fontWeight: 800, color: "#3E342B" } }, "请名士解签（可多轮追问）"),
                    h("span", { style: { fontSize: "10.5px", color: "#8C7A68" } }, "含近30条传讯与私心博弈")
                  ),
                  // 名士头像横向选择条
                  h(
                    "div",
                    { style: { display: "flex", gap: "7px", overflowX: "auto", paddingBottom: "4px", WebkitOverflowScrolling: "touch" } },
                    characters.map((c) => {
                      const cid = String(c.id);
                      const av = avatarMap[cid];
                      const isSel = selectedInterpCharId === cid;
                      const hasDone = Boolean(interpMap[cid]);
                      return h(
                        "button",
                        {
                          key: cid,
                          type: "button",
                          onClick: () => handleSelectInterpretChar(c, false),
                          style: {
                            position: "relative",
                            flexShrink: 0,
                            touchAction: "manipulation",
                            border: isSel ? "1.5px solid #C84B31" : "1px solid #E3D6C0",
                            background: isSel ? "#FFF4EE" : "#FFFDF8",
                            borderRadius: "12px",
                            padding: "5px 8px",
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            cursor: "pointer"
                          }
                        },
                        av
                          ? h("img", { src: av, alt: c.name, style: { width: "22px", height: "22px", borderRadius: "50%", objectFit: "cover" } })
                          : h("span", { style: { width: "22px", height: "22px", borderRadius: "50%", background: "#DECBB4", color: "#3E342B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10.5px", fontWeight: 800 } }, c.name.slice(0, 1)),
                        h("span", { style: { fontSize: "11.5px", fontWeight: 700, color: isSel ? "#C84B31" : "#4A3C31", whiteSpace: "nowrap" } }, c.name),
                        hasDone && h("span", { style: { width: "6px", height: "6px", borderRadius: "50%", background: "#C84B31", flexShrink: 0 } })
                      );
                    })
                  ),

                  // 正在推演加载态
                  isCharBusy &&
                    h(
                      "div",
                      { style: { background: "#FFFDF8", border: "1px solid #E6D9C3", borderRadius: "12px", padding: "12px", fontSize: "12px", color: "#7D6B59", textAlign: "center" } },
                      `正在请「${activeCharObj ? activeCharObj.name : "名士"}」结合近 30 条传讯细观卦象…`
                    ),

                  // 已选中名士的解签与追问对话流
                  !isCharBusy && activeThread && activeCharObj &&
                    h(
                      "div",
                      { style: { background: "#FFFDF8", border: "1px solid #E4D5BC", borderRadius: "14px", padding: "10px", display: "flex", flexDirection: "column", gap: "8px" } },
                      // 对话区头栏
                      h(
                        "div",
                        { style: { display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #F0E6D4", paddingBottom: "6px" } },
                        h(
                          "div",
                          { style: { display: "flex", alignItems: "center", gap: "6px" } },
                          h("strong", { style: { fontSize: "12.5px", color: "#3E342B" } }, `${activeCharObj.name} · 解签`),
                          h("span", { style: { fontSize: "10px", color: "#8C7A68" } }, `已参近 ${activeThread.chatContextCount || 0} 条传讯`)
                        ),
                        h(
                          "button",
                          {
                            type: "button",
                            onClick: () => handleSelectInterpretChar(activeCharObj, true),
                            style: { border: "1px solid #DFD0B8", background: "#FAF6EE", color: "#6B5A49", borderRadius: "7px", padding: "2px 7px", fontSize: "10.5px", fontWeight: 700, cursor: "pointer", touchAction: "manipulation" }
                          },
                          "重解"
                        )
                      ),

                      // 多轮消息列表
                      h(
                        "div",
                        { style: { display: "flex", flexDirection: "column", gap: "8px", maxHeight: "230px", overflowY: "auto", WebkitOverflowScrolling: "touch", paddingRight: "2px" } },
                        (activeThread.turns || []).map((t) => {
                          if (t.role === "user") {
                            return h(
                              "div",
                              { key: t.id, style: { alignSelf: "flex-end", maxWidth: "86%", background: "#4A3C31", color: "#FFFDF7", borderRadius: "12px 12px 3px 12px", padding: "7px 10px", fontSize: "12px", lineHeight: 1.55 } },
                              t.text
                            );
                          }
                          const isRev = !!revealedMotiveMap[t.id];
                          const stMeta = (Interp.STANCE_META && Interp.STANCE_META[t.stance]) || { label: "心绪难测", tone: "#5C4738", bg: "#F4EDE1", border: "#DECFA8" };
                          return h(
                            "div",
                            { key: t.id, style: { alignSelf: "flex-start", width: "96%", background: "#FAF4E8", border: "1px solid #E8DBC5", borderRadius: "12px 12px 12px 3px", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "5px" } },
                            h("div", { style: { fontSize: "12.5px", lineHeight: 1.65, color: "#3E342B", whiteSpace: "pre-wrap" } }, t.text),
                            t.tellClue &&
                              h("div", { style: { fontSize: "11px", color: "#8B745D", fontStyle: "italic", lineHeight: 1.45 } }, `微察：${t.tellClue}`),
                            t.hiddenMotive &&
                              h(
                                "div",
                                { style: { paddingTop: "2px" } },
                                h(
                                  "button",
                                  {
                                    type: "button",
                                    onClick: () => setRevealedMotiveMap((prev) => ({ ...prev, [t.id]: !prev[t.id] })),
                                    style: {
                                      border: "1px dashed #D3BEA0",
                                      background: isRev ? stMeta.bg : "#FFFDF8",
                                      color: isRev ? stMeta.tone : "#7D6B59",
                                      borderRadius: "7px",
                                      padding: "3px 8px",
                                      fontSize: "10.5px",
                                      fontWeight: 700,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      cursor: "pointer",
                                      touchAction: "manipulation"
                                    }
                                  },
                                  SvgIcon(h, "eye", { size: 12, color: isRev ? stMeta.tone : "#7D6B59" }),
                                  isRev ? `收起心绪 · ${stMeta.label}` : "窥探心绪（查看真伪）"
                                ),
                                isRev &&
                                  h(
                                    "div",
                                    { style: { marginTop: "5px", background: stMeta.bg, border: `1px solid ${stMeta.border}`, borderRadius: "8px", padding: "6px 8px", fontSize: "11.5px", lineHeight: 1.55, color: stMeta.tone } },
                                    h("strong", null, `【${stMeta.label}】`),
                                    t.hiddenMotive
                                  )
                              )
                          );
                        })
                      ),

                      // 快捷追问胶囊
                      h(
                        "div",
                        { style: { display: "flex", gap: "5px", overflowX: "auto", paddingBottom: "2px", WebkitOverflowScrolling: "touch" } },
                        (Interp.QUICK_FOLLOWUPS || []).map((q, idx) =>
                          h(
                            "button",
                            {
                              key: idx,
                              type: "button",
                              disabled: sendingFollowUp,
                              onClick: () => handleSendFollowUp(q),
                              style: {
                                flexShrink: 0,
                                touchAction: "manipulation",
                                border: "1px solid #E2D4BC",
                                background: "#F7F0E3",
                                color: "#5C4738",
                                borderRadius: "999px",
                                padding: "4px 9px",
                                fontSize: "10.5px",
                                fontWeight: 700,
                                cursor: sendingFollowUp ? "wait" : "pointer"
                              }
                            },
                            q
                          )
                        )
                      ),

                      // 自由追问输入框
                      h(
                        "div",
                        { style: { display: "flex", gap: "6px", alignItems: "center" } },
                        h("input", {
                          type: "text",
                          value: followUpInput,
                          disabled: sendingFollowUp,
                          onChange: (e) => setFollowUpInput(e.target.value),
                          onKeyDown: (e) => { if (e.key === "Enter") handleSendFollowUp(); },
                          placeholder: `继续追问${activeCharObj.name}…`,
                          style: { flex: 1, minWidth: 0, border: "1px solid #DDD0B8", background: "#FAF6EE", borderRadius: "999px", padding: "7px 11px", fontSize: "12px", color: "#3E342B", outline: "none", fontFamily: "inherit" }
                        }),
                        h(
                          "button",
                          {
                            type: "button",
                            disabled: sendingFollowUp || !followUpInput.trim(),
                            onClick: () => handleSendFollowUp(),
                            style: {
                              border: "none",
                              touchAction: "manipulation",
                              borderRadius: "999px",
                              background: sendingFollowUp || !followUpInput.trim() ? "#C9B9A3" : "#C84B31",
                              color: "#FFFDF7",
                              padding: "7px 11px",
                              fontSize: "11.5px",
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              cursor: sendingFollowUp ? "wait" : "pointer",
                              flexShrink: 0
                            }
                          },
                          SvgIcon(h, "send", { size: 13, color: "#FFFDF7" }),
                          sendingFollowUp ? "…" : "追问"
                        )
                      ),

                      // 抄送传讯按钮
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: () => handleOpenShareModal({
                            record: oracleResult,
                            activeThread,
                            sourceKind: "player",
                            defaultCharId: activeCharObj.id
                          }),
                          style: { border: "none", touchAction: "manipulation", borderRadius: "10px", background: "#4A3C31", color: "#FFFDF7", padding: "8px", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer" }
                        },
                        SvgIcon(h, "share", { size: 14, color: "#FFFDF7" }),
                        `抄送卦签卡片给名士`
                      )
                    )
                ),

              !selectedInterpCharId &&
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => handleOpenShareModal({
                      record: oracleResult,
                      activeThread: null,
                      sourceKind: "player",
                      defaultCharId: commentatorCharId || ""
                    }),
                    style: { border: "none", touchAction: "manipulation", borderRadius: "10px", background: "#4A3C31", color: "#FFFDF7", padding: "9px", fontSize: "12.5px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer" }
                  },
                  SvgIcon(h, "share", { size: 15, color: "#FFFDF7" }),
                  "抄送卦签卡片给名士"
                )
            )
          );
        })(),

      // ==========================================
      // 8. 抄送卦签卡片至名士传讯主线选择器浮层
      // ==========================================
      shareModalPayload &&
        (() => {
          const orderedChars = [...characters].sort((a, b) => {
            const aHit = String(a.id) === shareModalPayload.defaultCharId ? -1 : 0;
            const bHit = String(b.id) === shareModalPayload.defaultCharId ? -1 : 0;
            return aHit - bHit;
          });
          return h(
            "div",
            {
              onClick: (e) => { if (e.target === e.currentTarget) setShareModalPayload(null); },
              style: {
                position: "fixed",
                inset: 0,
                zIndex: 85,
                transform: "translateZ(0)",
                WebkitTransform: "translateZ(0)",
                background: "rgba(38,30,22,0.52)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px",
                pointerEvents: "auto"
              }
            },
            h(
              "div",
              {
                onClick: (e) => e.stopPropagation(),
                style: {
                  width: "100%",
                  maxWidth: "340px",
                  maxHeight: "76vh",
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  touchAction: "pan-y",
                  background: "#FAF6EE",
                  border: "1.5px solid #D4A03C",
                  borderRadius: "18px",
                  padding: "14px",
                  boxShadow: "0 16px 40px rgba(38,30,22,0.32)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }
              },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                h("div", { style: { fontSize: "14px", fontWeight: 900, color: "#3E342B" } }, "抄送卦签卡片至传讯"),
                h("button", { type: "button", onClick: () => setShareModalPayload(null), style: { border: "none", background: "transparent", padding: "4px", cursor: "pointer" } }, SvgIcon(h, "close", { size: 17, color: "#6B5A49" }))
              ),
              h("div", { style: { fontSize: "11.5px", color: "#7D6B59", lineHeight: 1.5 } },
                "卡片在传讯中仅展示精致标题，静默送入对方聊天主线；切回传讯手动点击「触发AI回复」后，名士将结合全量人设与卡片内容回复。"
              ),
              h("input", {
                type: "text",
                value: shareNoteInput,
                onChange: (e) => setShareNoteInput(e.target.value),
                placeholder: "附一句想对 TA 说的话（可选）…",
                style: { width: "100%", boxSizing: "border-box", border: "1px solid #DDD0B8", background: "#FFFDF8", borderRadius: "10px", padding: "8px 10px", fontSize: "12px", color: "#3E342B", outline: "none", fontFamily: "inherit" }
              }),
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "7px", maxHeight: "260px", overflowY: "auto", WebkitOverflowScrolling: "touch" } },
                orderedChars.map((c) => {
                  const cid = String(c.id);
                  const av = avatarMap[cid];
                  const isDef = cid === shareModalPayload.defaultCharId;
                  const isSending = sharingCharId === cid;
                  return h(
                    "button",
                    {
                      key: cid,
                      type: "button",
                      disabled: Boolean(sharingCharId),
                      onClick: () => handleConfirmShareToChar(c),
                      style: {
                        width: "100%",
                        touchAction: "manipulation",
                        border: isDef ? "1.5px solid #C84B31" : "1px solid #E5D9C4",
                        background: isDef ? "#FFF6F0" : "#FFFDF8",
                        borderRadius: "12px",
                        padding: "8px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        cursor: isSending ? "wait" : "pointer"
                      }
                    },
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 } },
                      av
                        ? h("img", { src: av, alt: c.name, style: { width: "30px", height: "30px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 } })
                        : h("span", { style: { width: "30px", height: "30px", borderRadius: "50%", background: "#DECBB4", color: "#3E342B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800, flexShrink: 0 } }, c.name.slice(0, 1)),
                      h("span", { style: { fontSize: "13px", fontWeight: 800, color: "#3E342B" } }, c.name),
                      isDef && h("span", { style: { fontSize: "10px", color: "#C84B31", background: "#FBECE9", borderRadius: "999px", padding: "1px 6px", fontWeight: 700 } }, "当前名士")
                    ),
                    h("span", { style: { fontSize: "11.5px", fontWeight: 700, color: "#C84B31", flexShrink: 0 } }, isSending ? "抄送中…" : "发送卡片")
                  );
                })
              )
            )
          );
        })()
    );
  }

  global.NuoChenweiLegoPage = NuoChenweiLegoPage;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { NuoChenweiLegoPage };
  }
})(typeof window !== "undefined" ? window : globalThis);
