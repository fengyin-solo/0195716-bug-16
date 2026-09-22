/**
 * 光路渲染器
 */
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.lenses = [];
        this.lightMode = CONFIG.LIGHT_DEFAULTS.mode;
        this.rayCount = CONFIG.LIGHT_DEFAULTS.rayCount;
        this.incidentAngle = CONFIG.LIGHT_DEFAULTS.angle;
        this.isRunning = false;
        this.showLabels = true;
        this.showDispersion = false;
        this.simpleMode = false;
        
        this.resize();
    }
    
    resize() {
        const wrapper = this.canvas.parentElement;
        const rect = wrapper.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        // 使用 setTransform 重置整个变换矩阵，避免多次 resize 时 scale 累积
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = rect.width;
        this.height = rect.height;

        this.render();
    }
    
    setLenses(lenses) {
        this.lenses = lenses;
        this.render();
    }
    
    setLightMode(mode) {
        this.lightMode = mode;
        this.render();
    }
    
    setRayCount(count) {
        this.rayCount = count;
        this.render();
    }
    
    setIncidentAngle(angle) {
        this.incidentAngle = angle;
        this.render();
    }
    
    toggleRunning() {
        this.isRunning = !this.isRunning;
        this.render();
        return this.isRunning;
    }
    
    setRunning(running) {
        this.isRunning = running;
        this.render();
    }
    
    toggleLabels() {
        this.showLabels = !this.showLabels;
        this.render();
        return this.showLabels;
    }
    
    setShowDispersion(show) {
        this.showDispersion = show;
        this.render();
    }
    
    setSimpleMode(simple) {
        this.simpleMode = simple;
        this.render();
    }
    
    render() {
        this.clear();
        this.drawGrid();
        this.drawOpticalAxis();
        
        if (this.isRunning) {
            this.drawLightRays();
        }
        
        this.drawLenses();
        
        if (this.showLabels && this.isRunning) {
            this.drawLabels();
        }
    }
    
    clear() {
        this.ctx.fillStyle = '#FAFAFA';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }
    
    drawGrid() {
        if (this.simpleMode) return;
        
        const gridSize = 40;
        this.ctx.strokeStyle = CONFIG.COLORS.GRID;
        this.ctx.lineWidth = 0.5;
        
        for (let x = gridSize; x < this.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }
        
        for (let y = gridSize; y < this.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }
    }
    
    drawOpticalAxis() {
        const centerY = this.height / 2;
        
        this.ctx.strokeStyle = CONFIG.COLORS.OPTICAL_AXIS;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        
        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(this.width, centerY);
        this.ctx.stroke();
        
        this.ctx.setLineDash([]);
    }
    
    drawLenses() {
        this.lenses.forEach(lens => this.drawLens(lens));
    }
    
    drawLens(lens) {
        const ctx = this.ctx;
        const x = lens.x;
        const y = lens.y;
        const width = lens.getWidth();
        const halfHeight = lens.getHeight() / 2;
        
        ctx.save();
        
        let fillColor = CONFIG.COLORS.LENS_FILL;
        let strokeColor = CONFIG.COLORS.LENS_STROKE;
        
        if (lens.material === 'lowDispersion') {
            fillColor = 'rgba(93, 122, 58, 0.3)';
            strokeColor = '#5D7A3A';
        } else if (lens.material === 'highIndex') {
            fillColor = 'rgba(93, 78, 140, 0.3)';
            strokeColor = '#5D4E8C';
        }
        
        if (lens.selected) {
            strokeColor = CONFIG.COLORS.LENS_SELECTED;
            ctx.shadowColor = CONFIG.COLORS.LENS_SELECTED;
            ctx.shadowBlur = 10;
        }
        
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = CONFIG.RENDER.LENS_STROKE_WIDTH;
        
        ctx.beginPath();
        
        switch (lens.type) {
            case CONFIG.LENS_TYPES.CONVEX:
                this.drawConvexLens(ctx, x, y, width, halfHeight, lens.curvature);
                break;
            case CONFIG.LENS_TYPES.CONCAVE:
                this.drawConcaveLens(ctx, x, y, width, halfHeight, lens.curvature);
                break;
            case CONFIG.LENS_TYPES.PLANO:
                this.drawPlanoLens(ctx, x, y, halfHeight);
                break;
            case CONFIG.LENS_TYPES.ASPHERIC:
                this.drawAsphericLens(ctx, x, y, width, halfHeight, lens.curvature);
                break;
        }
        
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    
    drawConvexLens(ctx, x, y, width, halfHeight, curvature) {
        const curveAmount = width * (curvature / 100);
        ctx.moveTo(x, y - halfHeight);
        ctx.quadraticCurveTo(x + curveAmount, y, x, y + halfHeight);
        ctx.quadraticCurveTo(x - curveAmount, y, x, y - halfHeight);
    }
    
    drawConcaveLens(ctx, x, y, width, halfHeight, curvature) {
        const curveAmount = width * (curvature / 100) * 0.5;
        const edgeWidth = width * 0.3;
        ctx.moveTo(x - edgeWidth, y - halfHeight);
        ctx.quadraticCurveTo(x + curveAmount, y, x - edgeWidth, y + halfHeight);
        ctx.lineTo(x + edgeWidth, y + halfHeight);
        ctx.quadraticCurveTo(x - curveAmount, y, x + edgeWidth, y - halfHeight);
        ctx.closePath();
    }
    
    drawPlanoLens(ctx, x, y, halfHeight) {
        ctx.rect(x - 4, y - halfHeight, 8, halfHeight * 2);
    }
    
    drawAsphericLens(ctx, x, y, width, halfHeight, curvature) {
        const curveAmount = width * (curvature / 100);
        ctx.moveTo(x, y - halfHeight);
        ctx.bezierCurveTo(x + curveAmount * 0.8, y - halfHeight * 0.3, x + curveAmount * 0.8, y + halfHeight * 0.3, x, y + halfHeight);
        ctx.bezierCurveTo(x - curveAmount * 0.8, y + halfHeight * 0.3, x - curveAmount * 0.8, y - halfHeight * 0.3, x, y - halfHeight);
    }
    
    drawLightRays() {
        let rays;
        
        if (this.lightMode === CONFIG.LIGHT_MODES.PARALLEL) {
            rays = Physics.generateParallelRays(this.height, this.rayCount, this.incidentAngle);
        } else {
            rays = Physics.generatePointSourceRays(50, this.height / 2, this.rayCount);
        }
        
        // 检查是否有透镜需要显示色散效果
        // 普通玻璃色散明显，低色散镜片色散小
        const hasDispersiveLens = this.lenses.some(l => l.dispersion > 0.05);
        
        if (this.showDispersion && hasDispersiveLens) {
            // 色散模式：分别绘制红、绿、蓝三色光
            // 绘制顺序：先红后蓝，这样蓝光在上层更明显
            ['red', 'green', 'blue'].forEach(color => {
                rays.forEach(ray => this.traceRayWithDispersion(ray, color));
            });
        } else {
            rays.forEach(ray => this.traceRay(ray));
        }
    }
    
    /**
     * 追踪并绘制单条光线（带色散效果）
     * 
     * 色散原理：
     * - 蓝光折射率最大，偏折最多
     * - 红光折射率最小，偏折最少
     * - 低色散镜片：三色光几乎重合
     * - 普通玻璃：三色光明显分离
     */
    traceRayWithDispersion(ray, color) {
        const ctx = this.ctx;
        let rayX = ray.x;
        let rayY = ray.y;
        let rayAngle = ray.angle;
        let lastLensId = null;
        
        // 设置颜色
        ctx.strokeStyle = CONFIG.COLORS[`RAY_${color.toUpperCase()}`];
        ctx.lineWidth = CONFIG.RENDER.RAY_WIDTH;
        
        ctx.beginPath();
        ctx.moveTo(rayX, rayY);
        
        // 追踪光线穿过多个透镜
        for (let i = 0; i < 20; i++) {
            let nearest = null;
            let nearestLens = null;
            let minDist = Infinity;
            
            for (const lens of this.lenses) {
                if (lens.id === lastLensId) continue;
                
                const hit = Physics.calculateRayLensIntersection(rayX, rayY, rayAngle, lens);
                if (hit && hit.distance < minDist) {
                    minDist = hit.distance;
                    nearest = hit;
                    nearestLens = lens;
                }
            }
            
            if (!nearest) break;
            
            ctx.lineTo(nearest.x, nearest.y);
            ctx.stroke();
            
            // 计算该颜色光的折射率
            const colorIndex = Physics.calculateDispersionIndex(
                nearestLens.refractiveIndex,
                nearestLens.dispersion,
                color
            );
            
            // 创建临时透镜对象，使用色散后的折射率
            const tempLens = {
                ...nearestLens,
                refractiveIndex: colorIndex,
                y: nearestLens.y,
                getHeight: () => nearestLens.getHeight(),
                type: nearestLens.type,
                curvature: nearestLens.curvature
            };
            
            const newAngle = Physics.calculateRefractedAngle(rayAngle, nearest.y, tempLens);
            
            rayX = nearest.x;
            rayY = nearest.y;
            rayAngle = newAngle;
            lastLensId = nearestLens.id;
            
            ctx.beginPath();
            ctx.moveTo(rayX, rayY);
        }
        
        // 画到画布边缘
        const dirX = Math.cos(rayAngle);
        const dirY = Math.sin(rayAngle);
        let endX, endY;
        
        if (Math.abs(dirX) > 0.001) {
            endX = dirX > 0 ? this.width + 50 : -50;
            endY = rayY + dirY * (endX - rayX) / dirX;
        } else {
            endX = rayX;
            endY = dirY > 0 ? this.height + 50 : -50;
        }
        
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
    
    /**
     * 追踪一条光线实际穿过的全部透镜（按光路先后顺序）
     *
     * 判定"实际参与光路"的唯一依据：当前光源模式下至少有一条光线
     * 与该透镜相交。画布上摆放位置过高/过低、不在光路上的透镜不会命中。
     *
     * @param {Object} ray 初始光线 { x, y, angle }
     * @returns {Array<{lens: Object, x: number, y: number, angle: number}>}
     *          命中片段，angle 为经过该透镜折射后的光线角度
     */
    traceRayPath(ray) {
        let rayX = ray.x;
        let rayY = ray.y;
        let rayAngle = ray.angle;
        let lastLensId = null;
        const segments = [];

        // 追踪光线穿过多个透镜
        for (let i = 0; i < 20; i++) {
            let nearest = null;
            let nearestLens = null;
            let minDist = Infinity;

            // 找最近的透镜（按距离排序）
            for (const lens of this.lenses) {
                // 跳过刚穿过的透镜
                if (lens.id === lastLensId) continue;

                const hit = Physics.calculateRayLensIntersection(rayX, rayY, rayAngle, lens);
                if (hit && hit.distance < minDist) {
                    minDist = hit.distance;
                    nearest = hit;
                    nearestLens = lens;
                }
            }

            // 没有更多透镜了
            if (!nearest) break;

            const newAngle = Physics.calculateRefractedAngle(rayAngle, nearest.y, nearestLens);

            rayX = nearest.x;
            rayY = nearest.y;
            rayAngle = newAngle;
            lastLensId = nearestLens.id;

            segments.push({ lens: nearestLens, x: nearest.x, y: nearest.y, angle: newAngle });
        }

        return segments;
    }

    /**
     * 获取当前光源模式下实际参与光路的透镜
     * （至少被一条光线穿过，按 x 坐标/光路顺序返回，不重复）
     */
    getLensesInPath() {
        if (this.lenses.length === 0) return [];

        let rays;
        if (this.lightMode === CONFIG.LIGHT_MODES.PARALLEL) {
            rays = Physics.generateParallelRays(this.height, this.rayCount, this.incidentAngle);
        } else {
            rays = Physics.generatePointSourceRays(50, this.height / 2, this.rayCount);
        }

        const hitOrder = new Map();
        rays.forEach(ray => {
            this.traceRayPath(ray).forEach(seg => {
                if (!hitOrder.has(seg.lens.id)) {
                    hitOrder.set(seg.lens.id, seg.lens);
                }
            });
        });

        // 按光路先后（x 坐标）排序返回
        return Array.from(hitOrder.values()).sort((a, b) => a.x - b.x);
    }

    /**
     * 追踪并绘制单条光线 - 支持多透镜
     *
     * 光路规律：
     * - 凸透镜：光线向光轴会聚
     * - 凹透镜：光线向外发散
     * - 平面透镜：不偏折
     * - 非球面：更精准会聚
     */
    traceRay(ray, color = null) {
        const ctx = this.ctx;

        // 设置颜色
        if (color) {
            ctx.strokeStyle = CONFIG.COLORS[`RAY_${color.toUpperCase()}`];
        } else {
            ctx.strokeStyle = CONFIG.COLORS.INCIDENT_RAY;
        }
        ctx.lineWidth = CONFIG.RENDER.RAY_WIDTH;

        // 复用统一的光路追踪，保证绘制与判定口径一致
        const segments = this.traceRayPath(ray);

        ctx.beginPath();
        ctx.moveTo(ray.x, ray.y);

        let currentX = ray.x;
        let currentY = ray.y;
        let currentAngle = ray.angle;

        segments.forEach((seg, index) => {
            // 画到交点
            ctx.lineTo(seg.x, seg.y);
            ctx.stroke();

            currentX = seg.x;
            currentY = seg.y;
            currentAngle = seg.angle;

            // 第一次折射后换颜色：红色入射光，蓝色折射光
            if (!color && index === 0) {
                ctx.strokeStyle = CONFIG.COLORS.REFRACTED_RAY;
            }

            ctx.beginPath();
            ctx.moveTo(currentX, currentY);
        });

        // 画到画布边缘
        const dirX = Math.cos(currentAngle);
        const dirY = Math.sin(currentAngle);
        let endX, endY;

        if (Math.abs(dirX) > 0.001) {
            endX = dirX > 0 ? this.width + 50 : -50;
            endY = currentY + dirY * (endX - currentX) / dirX;
        } else {
            endX = currentX;
            endY = dirY > 0 ? this.height + 50 : -50;
        }

        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
    
    drawLabels() {
        const ctx = this.ctx;
        
        this.lenses.forEach(lens => {
            if (lens.type === CONFIG.LENS_TYPES.PLANO) return;
            
            const focalLength = lens.getFocalLength();
            if (!isFinite(focalLength)) return;
            
            const focalX = lens.x + focalLength;
            const focalY = lens.y;
            
            if (focalX > 0 && focalX < this.width) {
                ctx.fillStyle = CONFIG.COLORS.FOCAL_POINT;
                ctx.beginPath();
                ctx.arc(focalX, focalY, CONFIG.RENDER.FOCAL_POINT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('F', focalX, focalY - 12);
            }
        });
        
        ctx.fillStyle = CONFIG.COLORS.OPTICAL_AXIS;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('光轴', 10, this.height / 2 - 8);
    }
    
    getLensAtPoint(x, y) {
        for (let i = this.lenses.length - 1; i >= 0; i--) {
            if (this.lenses[i].containsPoint(x, y)) {
                return this.lenses[i];
            }
        }
        return null;
    }
}
