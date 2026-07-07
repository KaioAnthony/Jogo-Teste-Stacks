import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- DOM refs ---
const scoreDisplay = document.getElementById('score-display');
const finalScoreSpan = document.getElementById('final-score');
const gameOverScreen = document.getElementById('game-over');
const restartBtn = document.getElementById('restart-btn');

// --- Variáveis Globais ---
let camera, scene, renderer;
let world;
let gameStarted = false;
let gameActive = true;
let moveDirection = 1;
const stack = [];
const overhangs = [];
const boxHeight = 1;
const originalBoxSize = 3;
let score = 0;

// --- Inicialização ---
init();

function init() {
    // Mundo físico
    world = new CANNON.World();
    world.gravity.set(0, -10, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 40;

    // Cena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Primeira caixa (base fixa)
    addLayer(0, 0, originalBoxSize, originalBoxSize, 'x', false);

    // Primeira caixa móvel
    addLayer(-10, 0, originalBoxSize, originalBoxSize, 'x', true);

    // Luzes
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 5);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xffeedd, 0.3);
    fillLight.position.set(-10, 10, -10);
    scene.add(fillLight);

    // Câmera ortográfica
    const width = 12;
    const height = width * (window.innerHeight / window.innerWidth);
    camera = new THREE.OrthographicCamera(
        width / -2,
        width / 2,
        height / 2,
        height / -2,
        1,
        100
    );
    camera.position.set(6, 6, 6);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.prepend(renderer.domElement);

    // Ajuste de janela
    window.addEventListener('resize', onResize);

    // Eventos
    window.addEventListener('click', handleClick);
    restartBtn.addEventListener('click', restartGame);
    restartBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    restartBtn.addEventListener('click', (e) => e.stopPropagation());

    // Primeiro render
    renderer.render(scene, camera);
}

// --- Funções do Jogo ---

function addLayer(x, z, width, depth, direction, falls = true) {
    const y = boxHeight * stack.length;
    const layer = generateBox(x, y, z, width, depth, falls);
    layer.direction = direction;
    stack.push(layer);
    return layer;
}

function addOverhang(x, z, width, depth) {
    const y = boxHeight * (stack.length - 1);
    const overhang = generateBox(x, y, z, width, depth, true);
    overhangs.push(overhang);
    return overhang;
}

function generateBox(x, y, z, width, depth, falls) {
    const geometry = new THREE.BoxGeometry(width, boxHeight, depth);
    const hue = 30 + stack.length * 4;
    const color = new THREE.Color(`hsl(${hue}, 85%, 55%)`);
    const material = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Física
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2));
    const mass = falls ? 5 : 0;
    const body = new CANNON.Body({ mass, shape });
    body.position.set(x, y, z);
    world.addBody(body);

    return {
        threejs: mesh,
        cannonjs: body,
        width,
        depth,
    };
}

function cutBox(topLayer, overlap, size, delta) {
    const direction = topLayer.direction;
    const newWidth = direction === 'x' ? overlap : topLayer.width;
    const newDepth = direction === 'z' ? overlap : topLayer.depth;

    topLayer.width = newWidth;
    topLayer.depth = newDepth;

    // Escala visual
    topLayer.threejs.scale[direction] = overlap / size;
    topLayer.threejs.position[direction] -= delta / 2;

    // Física
    topLayer.cannonjs.position[direction] -= delta / 2;
    const shape = new CANNON.Box(new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2));
    topLayer.cannonjs.shapes = [];
    topLayer.cannonjs.addShape(shape);
}

function updatePhysics() {
    world.step(1 / 60);
    overhangs.forEach((el) => {
        el.threejs.position.copy(el.cannonjs.position);
        el.threejs.quaternion.copy(el.cannonjs.quaternion);
    });
}

// --- Loop de Animação ---
function animation() {
    if (!gameActive) return;

    const speed = 0.15;
    const topLayer = stack[stack.length - 1];
    const direction = topLayer.direction;

    topLayer.threejs.position[direction] += speed * moveDirection;
    topLayer.cannonjs.position[direction] += speed * moveDirection;

    // Limites
    if (topLayer.threejs.position[direction] > 10) moveDirection = -1;
    else if (topLayer.threejs.position[direction] < -10) moveDirection = 1;

    // Câmera sobe
    const targetY = boxHeight * (stack.length - 2) + 4;
    if (camera.position.y < targetY) {
        camera.position.y += speed * 1.2;
        camera.lookAt(0, camera.position.y - 3, 0);
    }

    updatePhysics();
    renderer.render(scene, camera);
}

// --- Game Over ---
function endGame() {
    gameActive = false;
    renderer.setAnimationLoop(null);
    finalScoreSpan.textContent = score;
    gameOverScreen.classList.add('show');
}

// --- Reiniciar ---
function restartGame() {
    // Remove tudo da cena
    while (stack.length) {
        const obj = stack.pop();
        scene.remove(obj.threejs);
        world.removeBody(obj.cannonjs);
    }
    while (overhangs.length) {
        const obj = overhangs.pop();
        scene.remove(obj.threejs);
        world.removeBody(obj.cannonjs);
    }

    // Reseta estado
    score = 0;
    scoreDisplay.textContent = '0';
    gameActive = true;
    gameStarted = false;
    moveDirection = 1;
    gameOverScreen.classList.remove('show');

    // Reseta câmera
    camera.position.set(6, 6, 6);
    camera.lookAt(0, 0, 0);

    // Recria a base e o primeiro bloco
    addLayer(0, 0, originalBoxSize, originalBoxSize, 'x', false);
    addLayer(-10, 0, originalBoxSize, originalBoxSize, 'x', true);

    // Para a animação antiga e recomeça
    renderer.setAnimationLoop(null);
    renderer.render(scene, camera);
}

// --- Evento de Clique (cortar bloco) ---
function handleClick() {
    if (!gameActive) return;

    if (!gameStarted) {
        gameStarted = true;
        renderer.setAnimationLoop(animation);
        return;
    }

    const topLayer = stack[stack.length - 1];
    const previousLayer = stack[stack.length - 2];
    if (!topLayer || !previousLayer) return;

    const direction = topLayer.direction;
    const delta = topLayer.threejs.position[direction] - previousLayer.threejs.position[direction];
    const overhangSize = Math.abs(delta);
    const size = direction === 'x' ? topLayer.width : topLayer.depth;
    const overlap = size - overhangSize;

    if (overlap > 0) {
        // Corta o bloco
        cutBox(topLayer, overlap, size, delta);

        // Cria a rebarba
        const shift = (overlap / 2 + overhangSize / 2) * Math.sign(delta);
        const overhangX = direction === 'x' ? topLayer.threejs.position.x + shift : topLayer.threejs.position.x;
        const overhangZ = direction === 'z' ? topLayer.threejs.position.z + shift : topLayer.threejs.position.z;
        const overhangWidth = direction === 'x' ? overhangSize : topLayer.width;
        const overhangDepth = direction === 'z' ? overhangSize : topLayer.depth;
        addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);

        // Próximo bloco
        const nextDirection = direction === 'x' ? 'z' : 'x';
        const nextX = nextDirection === 'x' ? -10 : topLayer.threejs.position.x;
        const nextZ = nextDirection === 'z' ? -10 : topLayer.threejs.position.z;
        addLayer(nextX, nextZ, topLayer.width, topLayer.depth, nextDirection, true);

        // Aumenta pontuação
        score++;
        scoreDisplay.textContent = score;

    } else {
        // Errou → Game Over
        endGame();
    }
}

// --- Evento de redimensionamento ---
function onResize() {
    const width = 12;
    const height = width * (window.innerHeight / window.innerWidth);
    camera.left = width / -2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = height / -2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

console.log('Jogo da Torre — Clique para empilhar!');