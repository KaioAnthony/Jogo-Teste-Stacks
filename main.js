import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- Variáveis Globais ---
let camera, scene, renderer;
let world;
let gameStarted = false;
let moveDirection = 1;
const stack = [];
const overhangs = [];
const boxHeight = 1;
const originalBoxSize = 3;

// --- Inicialização ---
init();

function init() {
    world = new CANNON.World();
    world.gravity.set(0, -10, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 40;

    scene = new THREE.Scene(); 

    // Primeira caixa (base estável - massa 0 para não cair)
    addLayer(0, 0, originalBoxSize, originalBoxSize, "x", false);

    // Adicionando a primeira caixa móvel por cima
    addLayer(-10, 0, originalBoxSize, originalBoxSize, "x", true);

    // Luzes
    const luzAmbiente = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(luzAmbiente);

    const luzDirecional = new THREE.DirectionalLight(0xffffff, 0.6);
    luzDirecional.position.set(10, 20, 0);
    scene.add(luzDirecional);

    // Configuração da Câmera Ortográfica
    const width = 10;
    const height = width * (window.innerHeight / window.innerWidth);
    
    camera = new THREE.OrthographicCamera(
        width / -2,  // esquerda
        width / 2,   // direita
        height / 2,  // para cima
        height / -2, // para baixo
        1,           // perto
        100          // longe
    );
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);

    // Renderizador
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    renderer.render(scene, camera);
}

// --- Funções de Lógica do Jogo ---

function addLayer(x, z, width, depth, direction, falls = true) {
    const y = boxHeight * stack.length;
    const layer = generateBox(x, y, z, width, depth, falls);
    layer.direction = direction;

    stack.push(layer);
}

function addOverhang(x, z, width, depth) {
    const y = boxHeight * (stack.length - 1);
    // Overhangs sempre caem, então passamos true
    const overhang = generateBox(x, y, z, width, depth, true); 
    overhangs.push(overhang);
}

function generateBox(x, y, z, width, depth, falls) {
    const geometry = new THREE.BoxGeometry(width, boxHeight, depth);

    const color = new THREE.Color(`hsl(${30 + stack.length * 4}, 100%, 50%)`);
    const material = new THREE.MeshLambertMaterial({ color });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    scene.add(mesh);

    // Física CannonJS
    const shape = new CANNON.Box(
        new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2)
    );
    let mass = falls ? 5 : 0;
    const body = new CANNON.Body({ mass, shape });
    body.position.set(x, y, z);
    world.addBody(body);

    return {
        threejs: mesh,
        cannonjs: body, // Adicionado para fazer o vínculo correto na animação
        width,
        depth,
    };
}

function cutBox(topLayer, overlap, size, delta) {
    const direction = topLayer.direction;
    const newWidth = direction === "x" ? overlap : topLayer.width;
    const newDepth = direction === "z" ? overlap : topLayer.depth;

    topLayer.width = newWidth;
    topLayer.depth = newDepth;

    topLayer.threejs.scale[direction] = overlap / size;
    topLayer.threejs.position[direction] -= delta / 2;

    topLayer.cannonjs.position[direction] -= delta / 2;

    const shape = new CANNON.Box(
        new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2)
    );
    topLayer.cannonjs.shapes = [];
    topLayer.cannonjs.addShape(shape);
}

function animation() {
    const speed = 0.15;
    const topLayer = stack[stack.length - 1];
    const direction = topLayer.direction;
    
    // Move o bloco na direção atual multiplicando pelo sentido (1 ou -1)
    topLayer.threejs.position[direction] += speed * moveDirection;
    topLayer.cannonjs.position[direction] += speed * moveDirection;

    // Se o bloco se afastar demais (ex: passou de 10) ou voltar demais (passou de -10), ele inverte
    if (topLayer.threejs.position[direction] > 10) {
        moveDirection = -1; // Força a voltar
    } else if (topLayer.threejs.position[direction] < -10) {
        moveDirection = 1;  // Força a ir para frente de novo
    }

    // Subida da câmera
    if (camera.position.y < boxHeight * (stack.length - 2) + 4) {
        camera.position.y += speed;
    }
    
    updatePhysics();
    renderer.render(scene, camera);
}

function updatePhysics() {
    world.step(1 / 60);

    // Copia a posição da física do Cannon para o visual do ThreeJS (rebarbas caindo)
    overhangs.forEach((element) => {
        element.threejs.position.copy(element.cannonjs.position);
        element.threejs.quaternion.copy(element.cannonjs.quaternion);
    });
}

// --- Eventos de Interação ---

window.addEventListener("click", () => {
    if (!gameStarted) {
        renderer.setAnimationLoop(animation);
        gameStarted = true;
    } else {
        const topLayer = stack[stack.length - 1]; 
        const previousLayer = stack[stack.length - 2];
        const direction = topLayer.direction;

        // Correção: Adicionado o sinal de '-' que faltava para calcular a diferença
        const delta = topLayer.threejs.position[direction] - previousLayer.threejs.position[direction];
        const overhangSize = Math.abs(delta);
        const size = direction === "x" ? topLayer.width : topLayer.depth;
        const overlap = size - overhangSize;

        if (overlap > 0) {
            // AQUI entra a chamada da sua função cutBox!
            cutBox(topLayer, overlap, size, delta);

            // Geração da rebarba caindo (overhang)
            const overhangShift = (overlap / 2 + overhangSize / 2) * Math.sign(delta);
            const overhangX = direction === "x" ? topLayer.threejs.position.x + overhangShift : topLayer.threejs.position.x;
            const overhangZ = direction === "z" ? topLayer.threejs.position.z + overhangShift : topLayer.threejs.position.z;
            const overhangWidth = direction === "x" ? overhangSize : topLayer.width;
            const overhangDepth = direction === "z" ? overhangSize : topLayer.depth;

            addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);

            // Criar a próxima camada acima
            const nextDirection = direction === "x" ? "z" : "x";
            const nextX = nextDirection === "x" ? -10 : topLayer.threejs.position.x;
            const nextZ = nextDirection === "z" ? -10 : topLayer.threejs.position.z;

            // Correção: Passando as variáveis atualizadas com a ordem certa de parâmetros
            addLayer(nextX, nextZ, topLayer.width, topLayer.depth, nextDirection, true);
        } else {
            console.log("Game Over! Você errou o bloco.");
            renderer.setAnimationLoop(null); // Para o jogo
        }
    }
});