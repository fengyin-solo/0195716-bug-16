/**
 * 光学测验管理器
 *
 * 功能：
 * - 随机选择测验题目
 * - 验证用户答案（逐片检查画布上实际摆放的全部透镜 + 光源等整体设置）
 * - 评分并给出详细解释
 * - 提供提示功能
 * - 记录答题历史
 *
 * 判定口径：
 * - 画布上有几片透镜，就逐片给出结论（lensResults 与画布透镜一一对应）
 * - 全部透镜都满足题目标准、且整体设置（如光源模式）正确时才算通过
 * - 任一检查项之间互不短路，保证结果弹窗里每片透镜的各项明细完整、结论不错位
 */
class QuizManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.renderer = canvasManager.getRenderer();
        this.currentQuestion = null;
        this.questionHistory = [];
        this.score = 0;
        this.totalQuestions = 0;
        this.hintUsed = false;
        this.isQuizMode = false;
        this.answeredQuestions = new Set();
    }

    /**
     * 开启测验模式
     */
    startQuizMode() {
        this.isQuizMode = true;
        this.score = 0;
        this.totalQuestions = 0;
        this.answeredQuestions.clear();
        this.nextQuestion();
    }

    /**
     * 关闭测验模式
     */
    stopQuizMode() {
        this.isQuizMode = false;
        this.currentQuestion = null;
        this.hintUsed = false;
        window.dispatchEvent(new CustomEvent('quizStopped'));
    }

    /**
     * 获取下一道随机题目
     */
    nextQuestion() {
        const questions = CONFIG.QUIZ_QUESTIONS;
        let availableQuestions = questions.filter(q => !this.answeredQuestions.has(q.id));

        if (availableQuestions.length === 0) {
            this.answeredQuestions.clear();
            availableQuestions = questions;
        }

        const randomIndex = Math.floor(Math.random() * availableQuestions.length);
        this.currentQuestion = availableQuestions[randomIndex];
        this.hintUsed = false;

        this.answeredQuestions.add(this.currentQuestion.id);

        window.dispatchEvent(new CustomEvent('questionChanged', {
            detail: this.currentQuestion
        }));

        return this.currentQuestion;
    }

    /**
     * 获取提示
     */
    getHint() {
        if (!this.currentQuestion) return null;

        this.hintUsed = true;
        const hints = this.currentQuestion.hints;
        const randomIndex = Math.floor(Math.random() * hints.length);

        return hints[randomIndex];
    }

    /**
     * 验证用户答案
     *
     * 始终以画布上实际摆放的全部透镜为准（this.canvasManager.getLenses()），
     * 不使用任何缓存；返回后重做实验时，再次提交会重新逐片计算。
     */
    submitAnswer() {
        const emptyResult = (explanation) => ({
            isCorrect: false,
            score: 0,
            explanation: explanation,
            details: [],
            lensResults: [],
            globalResults: []
        });

        if (!this.currentQuestion) {
            return emptyResult('请先选择一道题目');
        }

        const question = this.currentQuestion;

        // 画布上实际摆放的透镜（实时读取，不看添加顺序、不做缓存）
        const lenses = this.canvasManager.getLenses();

        if (lenses.length === 0) {
            return emptyResult('请先在画布上添加透镜，然后再提交答案。');
        }

        // 1. 逐片透镜判定：每片独立跑完全部适用标准，互不短路
        const lensResults = lenses.map((lens, index) =>
            this.evaluateLens(lens, index, question)
        );

        // 2. 整体设置判定（光源模式等与具体透镜无关的项目）
        const globalResults = [];
        if (question.validation.checkLightMode) {
            const lightMode = this.renderer.lightMode;
            const lightCorrect = lightMode === question.requirements.lightMode;
            globalResults.push({
                key: 'wrongLightMode',
                name: '光源模式',
                expected: question.requirements.lightMode === 'parallel' ? '平行光' : '点光源',
                actual: lightMode === 'parallel' ? '平行光' : '点光源',
                correct: lightCorrect
            });
        }

        const allLensCorrect = lensResults.every(r => r.correct);
        const allGlobalCorrect = globalResults.every(r => r.correct);
        const isCorrect = allLensCorrect && allGlobalCorrect;

        // 3. 汇总结论解释：整体设置优先，其次按透镜在画布上的顺序取第一项不达标
        let explanationKey = 'correct';
        const firstGlobalFailure = globalResults.find(r => !r.correct);
        const firstLensFailure = lensResults.find(r => !r.correct);

        if (firstGlobalFailure) {
            explanationKey = firstGlobalFailure.key;
        } else if (firstLensFailure) {
            explanationKey = firstLensFailure.failureKey || 'wrongType';
        }

        let earnedScore = 0;
        if (isCorrect) {
            earnedScore = this.hintUsed ? 5 : 10;
            this.score += earnedScore;
        }
        this.totalQuestions++;

        const explanation = question.explanation[explanationKey] || question.explanation.correct;

        this.questionHistory.push({
            questionId: question.id,
            title: question.title,
            isCorrect: isCorrect,
            score: earnedScore,
            hintUsed: this.hintUsed,
            timestamp: Date.now()
        });

        // details 为扁平明细（逐片透镜明细 + 整体设置明细），保持与旧版调用方兼容
        const details = [];
        lensResults.forEach(result => {
            result.details.forEach(detail => details.push(detail));
        });
        globalResults.forEach(result => details.push(result));

        return {
            isCorrect: isCorrect,
            score: earnedScore,
            totalScore: this.score,
            totalQuestions: this.totalQuestions,
            explanation: explanation,
            details: details,
            lensResults: lensResults,
            globalResults: globalResults,
            hintUsed: this.hintUsed
        };
    }

    /**
     * 评定单片透镜是否满足题目全部适用标准
     *
     * 各项检查独立执行，不因为前面的项目失败而跳过，
     * 这样结果弹窗里每片透镜的结论始终完整、不会错位。
     *
     * @returns {Object} { index, id, label, correct, failureKey, details }
     */
    evaluateLens(lens, index, question) {
        const validation = question.validation;
        const requirements = question.requirements;
        const details = [];
        let failureKey = null;

        const record = (detail, passed) => {
            details.push(detail);
            if (!passed && failureKey === null) {
                failureKey = detail.failureKey;
            }
        };

        // 透镜类型
        if (validation.checkType) {
            const typeCorrect = lens.type === requirements.lensType;
            record({
                name: '透镜类型',
                expected: this.getLensTypeName(requirements.lensType),
                actual: lens.getTypeName(),
                correct: typeCorrect,
                failureKey: 'wrongType'
            }, typeCorrect);
        }

        // 材料类型
        if (validation.checkMaterial) {
            const materialCorrect = lens.material === requirements.material;
            record({
                name: '材料类型',
                expected: this.getMaterialName(requirements.material),
                actual: lens.getMaterialName(),
                correct: materialCorrect,
                failureKey: 'wrongMaterial'
            }, materialCorrect);
        }

        // 折射率（与参数面板口径一致：两位小数）
        if (validation.checkRefractiveIndex) {
            const ri = lens.refractiveIndex;
            const minRI = requirements.minRefractiveIndex || 1.0;
            const maxRI = requirements.maxRefractiveIndex || 2.0;
            const riCorrect = ri >= minRI && ri <= maxRI;
            record({
                name: '折射率',
                expected: `${minRI.toFixed(2)} - ${maxRI.toFixed(2)}`,
                actual: ri.toFixed(2),
                correct: riCorrect,
                failureKey: 'wrongRI'
            }, riCorrect);
        }

        // 曲率（与参数面板口径一致：整数百分比）
        if (validation.checkCurvature) {
            const curvature = lens.curvature;
            const minCurv = requirements.minCurvature || 0;
            const maxCurv = requirements.maxCurvature || 100;
            const curvCorrect = curvature >= minCurv && curvature <= maxCurv;
            record({
                name: '曲率',
                expected: `${minCurv}% - ${maxCurv}%`,
                actual: `${curvature}%`,
                correct: curvCorrect,
                failureKey: 'wrongCurvature'
            }, curvCorrect);
        }

        // 光线会聚
        if (validation.checkConvergence) {
            const convergenceResult = this.checkConvergence(lens);
            record({
                name: '光线会聚',
                expected: '光线会聚到一点',
                actual: convergenceResult.message,
                correct: convergenceResult.converging,
                failureKey: 'noConvergence'
            }, convergenceResult.converging);
        }

        // 光线发散
        if (validation.checkDivergence) {
            const divergenceResult = this.checkDivergence(lens);
            record({
                name: '光线发散',
                expected: '光线向外发散',
                actual: divergenceResult.message,
                correct: divergenceResult.diverging,
                failureKey: 'noDivergence'
            }, divergenceResult.diverging);
        }

        // 光线不偏折
        if (validation.checkNoDeflection) {
            const noDeflectionResult = this.checkNoDeflection(lens);
            record({
                name: '光线偏折',
                expected: '光线方向不变',
                actual: noDeflectionResult.message,
                correct: noDeflectionResult.noDeflection,
                failureKey: 'hasDeflection'
            }, noDeflectionResult.noDeflection);
        }

        // 色散效果
        if (validation.checkDispersion) {
            const dispersionResult = this.checkDispersion(lens);
            record({
                name: '色散效果',
                expected: '色散现象明显',
                actual: dispersionResult.message,
                correct: dispersionResult.hasDispersion,
                failureKey: 'noDispersion'
            }, dispersionResult.hasDispersion);
        }

        // 低色散效果
        if (validation.checkLowDispersion) {
            const lowDispersionResult = this.checkLowDispersion(lens);
            record({
                name: '低色散效果',
                expected: '色散很小',
                actual: lowDispersionResult.message,
                correct: lowDispersionResult.lowDispersion,
                failureKey: 'highDispersion'
            }, lowDispersionResult.lowDispersion);
        }

        // 球差现象
        if (validation.checkSphericalAberration) {
            const aberrationResult = this.checkSphericalAberration(lens);
            record({
                name: '球差现象',
                expected: '存在明显球差',
                actual: aberrationResult.message,
                correct: aberrationResult.hasAberration,
                failureKey: 'noAberration'
            }, aberrationResult.hasAberration);
        }

        // 消球差效果
        if (validation.checkNoSphericalAberration) {
            const noAberrationResult = this.checkNoSphericalAberration(lens);
            record({
                name: '消球差效果',
                expected: '球差被消除',
                actual: noAberrationResult.message,
                correct: noAberrationResult.noAberration,
                failureKey: 'hasAberration'
            }, noAberrationResult.noAberration);
        }

        return {
            index: index,
            id: lens.id,
            label: `透镜 ${index + 1}（${lens.getTypeName()}）`,
            correct: failureKey === null,
            failureKey: failureKey,
            details: details
        };
    }

    /**
     * 检查光线会聚情况
     */
    checkConvergence(lens) {
        if (lens.type !== CONFIG.LENS_TYPES.CONVEX) {
            return { converging: false, message: '需要使用凸透镜' };
        }

        const focalLength = lens.getFocalLength();
        const minFocal = this.currentQuestion.requirements.minFocalLength || 50;
        const maxFocal = this.currentQuestion.requirements.maxFocalLength || 500;

        if (focalLength < minFocal || focalLength > maxFocal) {
            return {
                converging: false,
                message: `焦距 ${Math.round(focalLength)}px 不在合适范围内 (${minFocal}-${maxFocal}px)`
            };
        }

        const strength = (lens.refractiveIndex - 1) * (lens.curvature / 100);
        if (strength < 0.15) {
            return { converging: false, message: '会聚能力太弱，请增大折射率或曲率' };
        }

        return { converging: true, message: `光线会聚良好，焦距约 ${Math.round(focalLength)}px` };
    }

    /**
     * 检查光线发散情况
     */
    checkDivergence(lens) {
        if (lens.type !== CONFIG.LENS_TYPES.CONCAVE) {
            return { diverging: false, message: '需要使用凹透镜' };
        }

        const strength = (lens.refractiveIndex - 1) * (lens.curvature / 100);
        if (strength < 0.1) {
            return { diverging: false, message: '发散能力太弱，请增大折射率或曲率' };
        }

        return { diverging: true, message: '光线发散效果明显' };
    }

    /**
     * 检查光线是否无偏折
     */
    checkNoDeflection(lens) {
        if (lens.type !== CONFIG.LENS_TYPES.PLANO) {
            return { noDeflection: false, message: '需要使用平面透镜' };
        }

        if (Math.abs(this.renderer.incidentAngle) > 5) {
            return { noDeflection: false, message: '请让光线垂直入射（入射角为0）' };
        }

        return { noDeflection: true, message: '光线沿直线传播，方向不变' };
    }

    /**
     * 检查色散效果
     */
    checkDispersion(lens) {
        if (lens.dispersion < 0.2) {
            return { hasDispersion: false, message: '材料色散太小，请使用普通玻璃' };
        }

        if (Math.abs(this.renderer.incidentAngle) < 5) {
            return { hasDispersion: false, message: '请增大入射角，让光线斜入射' };
        }

        const strength = (lens.refractiveIndex - 1) * (lens.curvature / 100);
        if (strength < 0.2) {
            return { hasDispersion: false, message: '偏折太弱，色散不明显' };
        }

        return { hasDispersion: true, message: '色散现象明显，不同颜色光分离' };
    }

    /**
     * 检查低色散效果
     */
    checkLowDispersion(lens) {
        if (lens.dispersion > 0.15) {
            return { lowDispersion: false, message: '材料色散较大，请使用低色散镜片' };
        }

        return { lowDispersion: true, message: '色散很小，不同颜色光几乎重合' };
    }

    /**
     * 检查球差现象
     */
    checkSphericalAberration(lens) {
        if (lens.type !== CONFIG.LENS_TYPES.CONVEX) {
            return { hasAberration: false, message: '需要使用球面凸透镜' };
        }

        if (lens.curvature < 50) {
            return { hasAberration: false, message: '曲率太小，球差不明显' };
        }

        return { hasAberration: true, message: '球差明显，边缘光线会聚点与中心不同' };
    }

    /**
     * 检查无球差效果
     */
    checkNoSphericalAberration(lens) {
        if (lens.type !== CONFIG.LENS_TYPES.ASPHERIC) {
            return { noAberration: false, message: '需要使用非球面透镜' };
        }

        return { noAberration: true, message: '球差被消除，所有光线会聚到同一点' };
    }

    /**
     * 获取透镜类型中文名称
     * 与参数面板（Lens#getTypeName）使用同一套名称口径
     */
    getLensTypeName(type) {
        const names = {
            [CONFIG.LENS_TYPES.CONVEX]: '凸透镜',
            [CONFIG.LENS_TYPES.CONCAVE]: '凹透镜',
            [CONFIG.LENS_TYPES.PLANO]: '平面透镜',
            [CONFIG.LENS_TYPES.ASPHERIC]: '非球面透镜'
        };
        return names[type] || type;
    }

    /**
     * 获取材料中文名称
     */
    getMaterialName(material) {
        const names = {
            normal: '普通玻璃',
            highIndex: '高折射率镜片',
            lowDispersion: '低色散镜片'
        };
        return names[material] || material;
    }

    /**
     * 返回画布重做当前实验：回滚上一次提交的计分，
     * 这样同一道题修改后重新提交不会重复计分/重复计数。
     */
    undoLastSubmission() {
        if (this.questionHistory.length === 0) return;

        const last = this.questionHistory[this.questionHistory.length - 1];
        if (last.questionId === this.currentQuestion.id) {
            this.questionHistory.pop();
            this.score = Math.max(0, this.score - last.score);
            this.totalQuestions = Math.max(0, this.totalQuestions - 1);
        }
    }

    /**
     * 获取当前得分
     */
    getScore() {
        return {
            score: this.score,
            totalQuestions: this.totalQuestions,
            accuracy: this.totalQuestions > 0
                ? Math.round((this.questionHistory.filter(q => q.isCorrect).length / this.totalQuestions) * 100)
                : 0
        };
    }
}
