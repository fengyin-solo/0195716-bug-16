/**
 * 画布管理器
 *
 * 统一使用 Pointer Events 处理鼠标、触摸与触控笔（旧浏览器回退到
 * mouse/touch 两套事件）；判定与渲染都以画布上实际参与光路的透镜为准，
 * 与添加顺序无关。
 */
class CanvasManager {
    constructor() {
        this.canvas = document.getElementById('optics-canvas');
        this.wrapper = document.getElementById('canvas-wrapper');
        this.renderer = new Renderer(this.canvas);
        this.lenses = [];
        this.selectedLens = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.activePointerId = null;
        // 拖入计数，避免子元素引发 dragleave/dragover 抖动导致提示闪烁
        this.dragDepth = 0;

        this.init();
    }

    init() {
        this.bindEvents();
        this.handleResize();
    }

    bindEvents() {
        // 窗口大小变化：按画布上实际摆放的透镜逐片夹取并重算光路
        window.addEventListener('resize', Utils.debounce(() => {
            this.handleResize();
        }, 100));

        if (window.PointerEvent) {
            // 指针事件：鼠标、触摸、触控笔统一入口
            this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
            this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
            this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
            this.canvas.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
        } else {
            // 回退：鼠标事件
            this.canvas.addEventListener('mousedown', (e) => this.handlePointerDown(e));
            this.canvas.addEventListener('mousemove', (e) => this.handlePointerMove(e));
            this.canvas.addEventListener('mouseup', () => this.handlePointerUp());
            this.canvas.addEventListener('mouseleave', () => this.handlePointerUp());

            // 回退：触摸事件（passive: false 才能阻止滚动）
            this.canvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handlePointerDown(e);
            }, { passive: false });

            this.canvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
                this.handlePointerMove(e);
            }, { passive: false });

            this.canvas.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.handlePointerUp(e);
            }, { passive: false });

            this.canvas.addEventListener('touchcancel', () => this.handlePointerUp());
        }

        // 拖放事件（桌面端 HTML5 拖拽）
        this.wrapper.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.wrapper.addEventListener('dragenter', (e) => this.handleDragEnter(e));
        this.wrapper.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.wrapper.addEventListener('drop', (e) => this.handleDrop(e));
    }

    /**
     * 获取指针位置（兼容鼠标和触摸）
     */
    getPointerPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX, clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        // 计算相对于画布的位置
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        return { x, y };
    }

    /**
     * 将透镜位置限制在画布可视范围内
     */
    clampLensPosition(x, y) {
        return {
            x: Utils.clamp(x, 50, this.renderer.width - 50),
            y: Utils.clamp(y, 50, this.renderer.height - 50)
        };
    }

    handleResize() {
        this.renderer.resize();

        // 逐片夹取实际摆放在画布上的透镜，再整体重算并渲染
        this.lenses.forEach(lens => {
            const pos = this.clampLensPosition(lens.x, lens.y);
            lens.x = pos.x;
            lens.y = pos.y;
        });

        this.renderer.setLenses(this.lenses);
    }

    handlePointerDown(e) {
        // 多点触摸时只跟踪最先按下的那根手指
        if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId) {
            return;
        }

        const pos = this.getPointerPos(e);
        const lens = this.renderer.getLensAtPoint(pos.x, pos.y);

        if (lens) {
            this.selectLens(lens);
            this.isDragging = true;
            if (e.pointerId !== undefined) {
                this.activePointerId = e.pointerId;
                // 锁定后续事件，触摸拖动时不触发浏览器滚动/手势
                try {
                    this.canvas.setPointerCapture(e.pointerId);
                } catch (err) {
                    // 部分浏览器对已释放的指针调用会抛错，忽略即可
                }
            }
            this.dragOffset = {
                x: pos.x - lens.x,
                y: pos.y - lens.y
            };
        } else {
            this.deselectLens();
        }
    }

    handlePointerMove(e) {
        if (!this.isDragging || !this.selectedLens) return;
        if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId) {
            return;
        }

        const pos = this.getPointerPos(e);
        const clamped = this.clampLensPosition(
            pos.x - this.dragOffset.x,
            pos.y - this.dragOffset.y
        );

        this.selectedLens.x = clamped.x;
        this.selectedLens.y = clamped.y;

        // 位置变化可能让透镜进入/离开光路，立即重算
        this.renderer.render();
    }

    handlePointerUp(e) {
        if (e && e.pointerId !== undefined &&
            this.activePointerId !== null && e.pointerId !== this.activePointerId) {
            return;
        }
        this.isDragging = false;
        this.activePointerId = null;
    }

    handleDragEnter(e) {
        e.preventDefault();
        this.dragDepth++;
        document.getElementById('canvas-drop-hint').classList.remove('hidden');
    }

    handleDragOver(e) {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
        }
    }

    handleDragLeave(e) {
        // 只在真正离开画布区域（而非移入子元素）时隐藏提示
        this.dragDepth = Math.max(0, this.dragDepth - 1);
        if (this.dragDepth === 0) {
            document.getElementById('canvas-drop-hint').classList.add('hidden');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        this.dragDepth = 0;
        document.getElementById('canvas-drop-hint').classList.add('hidden');

        const lensType = e.dataTransfer.getData('lens-type');
        const material = e.dataTransfer.getData('lens-material');

        if (!lensType) return;

        const rawPos = this.getPointerPos(e);
        // 落点按当前画布尺寸夹取，避免拖到边缘时透镜落在可视区域外
        const pos = this.clampLensPosition(rawPos.x, rawPos.y);

        const lens = new Lens({
            type: lensType,
            x: pos.x,
            y: pos.y,
            material: material || 'normal'
        });

        this.addLens(lens);
        this.selectLens(lens);
        Utils.showToast('透镜已添加', 'success');
    }

    addLens(lens) {
        // 统一入口再夹取一次，触摸点击添加等路径同样保证透镜在画布内
        const pos = this.clampLensPosition(lens.x, lens.y);
        lens.x = pos.x;
        lens.y = pos.y;

        this.lenses.push(lens);
        this.renderer.setLenses(this.lenses);
        return lens;
    }

    removeLens(lens) {
        const index = this.lenses.indexOf(lens);
        if (index > -1) {
            this.lenses.splice(index, 1);
            if (this.selectedLens === lens) {
                this.deselectLens();
            }
            this.renderer.setLenses(this.lenses);
        }
    }

    selectLens(lens) {
        if (this.selectedLens) {
            this.selectedLens.selected = false;
        }

        this.selectedLens = lens;
        lens.selected = true;
        this.renderer.render();

        window.dispatchEvent(new CustomEvent('lensSelected', { detail: lens }));
    }

    deselectLens() {
        if (this.selectedLens) {
            this.selectedLens.selected = false;
            this.selectedLens = null;
            this.renderer.render();
        }

        window.dispatchEvent(new CustomEvent('lensDeselected'));
    }

    /**
     * 获取当前实际参与光路（被光线穿过）的透镜，按光路先后排序。
     * 画布上存在但光线没有穿过的透镜不计入。
     */
    getActiveLenses() {
        return this.renderer.getLensesInPath();
    }

    clear() {
        this.lenses = [];
        this.selectedLens = null;
        this.isDragging = false;
        this.activePointerId = null;
        this.renderer.setLenses([]);
        this.renderer.render();
    }

    getRenderer() {
        return this.renderer;
    }
}
