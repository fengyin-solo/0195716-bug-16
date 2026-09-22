/**
 * 光学测验管理器
 * 
 * 功能：
 * - 随机选择测验题目
 * - 验证用户答案（透镜类型、参数、光线模式等）
 * - 评分并给出详细解释
 * - 提供提示功能
 * - 记录答题历史
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
     * 判定范围：画布上实际参与光路（被当前光源发出的光线穿过）的全部透镜，
     * 与透镜添加顺序无关。每一片透镜都按题目标准逐片检查，逐片列出结论；
     * 只有所有参与光路的透镜全部达标，整题才算正确。
     * 画布上存在但没有被光线穿过的透镜不参与判定，仅在结果中列出提示。
     */
    submitAnswer() {
        if (!this.currentQuestion) {
            return {
                isCorrect: false,
                score: 0,
                explanation: '请先选择一道题目',
                details: { lensResults: [], globalItems: [], inactiveLenses: [] }
            };
        }

        const question = this.currentQuestion;
        const validation = question.validation;
        const requirements = question.requirements;
        const allLenses = this.canvasManager.lenses;
        const lightMode = this.renderer.lightMode;

        if (allLenses.length === 0) {
            return {
                isCorrect: false,
                score: 0,
                explanation: '请先在画布上添加一个透镜，然后再提交答案。',
                details: { lensResults: [], globalItems: [], inactiveLenses: [] }
            };
        }

        // 实际参与光路的透镜（按光路先后排序），而不是 lenses[0]
        const activeLenses = this.canvasManager.getActiveLenses();

        if (activeLenses.length === 0) {
            return {
                isCorrect: false,
                score: 0,
                explanation: '画布上的透镜都不在当前光路上，请把透镜移动到光线能够穿过的位置（与光轴大致平齐），启动光路后再提交。',
                details: {
                    lensResults: [],
                    globalItems: [],
                    inactiveLenses: allLenses.map(lens => ({
                        name: lens.getTypeName(),
                        material: lens.getMaterialName()
                    }))
                }
            };
        }

        // 每一片透镜一个结果分组
        const lensResults = activeLenses.map((lens, index) => ({
            index: index + 1,
            name: lens.getTypeName(),
            material: lens.getMaterialName(),
            items: [],
            allCorrect: true
        }));
        const globalItems = [];

        let isCorrect = true;
        let explanationKey = 'correct';
        let explanationOverride = null;

        // 记录第一项失败，用于选择对应讲解文案
        const markFailure = (key, lensIndex) => {
            if (isCorrect) {
                isCorrect = false;
                explanationKey = key;
                if (activeLenses.length > 1) {
                    explanationOverride = `第 ${lensIndex + 1} 片透镜（${activeLenses[lensIndex].getTypeName()}）不满足要求。`;
                }
            }
        };

        // 1. 透镜类型（逐片检查）
        if (validation.checkType) {
            activeLenses.forEach((lens, lensIndex) => {
                const typeCorrect = lens.type === requirements.lensType;
                lensResults[lensIndex].items.push({
                    name: '透镜类型',
                    expected: Lens.getTypeNameByType(requirements.lensType),
                    actual: lens.getTypeName(),
                    correct: typeCorrect
                });
                if (!typeCorrect) {
                    lensResults[lensIndex].allCorrect = false;
                    markFailure('wrongType', lensIndex);
                }
            });
        }

        // 2. 光源模式（整题只检查一次）
        if (validation.checkLightMode) {
            const lightCorrect = lightMode === requirements.lightMode;
            globalItems.push({
                name: '光源模式',
                expected: requirements.lightMode === 'parallel' ? '平行光' : '点光源',
                actual: lightMode === 'parallel' ? '平行光' : '点光源',
                correct: lightCorrect
            });
            if (!lightCorrect && isCorrect) {
                isCorrect = false;
                explanationKey = 'wrongLightMode';
            }
        }

        // 3. 材料类型（逐片检查）
        if (validation.checkMaterial) {
            activeLenses.forEach((lens, lensIndex) => {
                const materialCorrect = lens.material === requirements.material;
                lensResults[lensIndex].items.push({
                    name: '材料类型',
                    expected: Lens.getMaterialNameById(requirements.material),
                    actual: lens.getMaterialName(),
                    correct: materialCorrect
                });
                if (!materialCorrect) {
                    lensResults[lensIndex].allCorrect = false;
                    markFailure('wrongMaterial', lensIndex);
                }
            });
        }

        // 4. 折射率（逐片检查）
        if (validation.checkRefractiveIndex) {
            const minRI = requirements.minRefractiveIndex || 1.0;
            const maxRI = requirements.maxRefractiveIndex || 2.0;
            activeLenses.forEach((lens, lensIndex) => {
                const ri = lens.refractiveIndex;
                const riCorrect = ri >= minRI && ri <= maxRI;
                lensResults[lensIndex].items.push({
                    name: '折射率',
                    expected: `${minRI.toFixed(2)} - ${maxRI.toFixed(2)}`,
                    actual: ri.toFixed(2),
                    correct: riCorrect
                });
                if (!riCorrect) {
                    lensResults[lensIndex].allCorrect = false;
                    markFailure('wrongRI', lensIndex);
                }
            });
        }

        // 5. 曲率（逐片检查）
        if (validation.checkCurvature) {
            const minCurv = requirements.minCurvature || 0;
            const maxCurv = requirements.maxCurvature || 100;
            activeLenses.forEach((lens, lensIndex) => {
                const curvature = lens.curvature;
                const curvCorrect = curvature >= minCurv && curvature <= maxCurv;
                lensResults[lensIndex].items.push({
                    name: '曲率',
                    expected: `${minCurv}% - ${maxCurv}%`,
                    actual: `${curvature}%`,
                    correct: curvCorrect
                });
                if (!curvCorrect) {
                    lensResults[lensIndex].allCorrect = false;
                    markFailure('wrongCurvature', lensIndex);
                }
            });
        }

        // 6. 光线会聚（逐片检查）
        if (validation.checkConvergence) {
            activeLenses.forEach((lens, lensIndex) => {
                const result = this.checkConvergence(lens);
                lensResults[lensIndex].items.push({
                    name: '光线会聚',
                    expected: '光线会聚到一点',
                    actual: result.message,
                    correct: result.converging
                });
                if (!result.converging) {
                    lensResults[lensIndex].allCorrect = false;
                    markFailure('noConvergence', lensIndex);
                }
            });
        }

        // 7. 光线发散（逐片检查）
        if (validation.checkDivergence) {
            activeLenses.forEach((lens, lensIndex) => {
                const result = this.checkDivergence(lens);
                lensResults[lensIndex].items.push({
                    name: '光线发散',
                    expected: '光线向外发散',
                    actual: result.message,
                    correct: result.diverging
                });
                if (!result.diverging) {
                    lensResults[lensIndex].allCorrect = false;
                    markFailure('noDivergence', lensIndex);
                }
            });
        }

        // 8. 无偏折（逐片检查）
        if (validation.checkNoDeflection) {
            activeLenses.forEach((lens, lensIndex) => {
                const result = this.checkNoDeflection(lens);
                lensResults[lensIndex].items.push({
                    name: '光线偏折',
                    expected: '光线方向不变',
                    actual: result.message,
                    correct: result.noDeflection
                });
                if (!result.noDeflection) {
                    lensResults[lensIndex].allCorrect = false;
                    markFailure('hasDeflection', lensIndex);
                }
            });
        }

        // 9. 色散效果（逐片检查）
        if (validation.checkDispersion) {
            activeLenses.forEach((lens, lensIndex) => {
                const result = this.checkDispersion(lens);
                lensResults[lensIndex].items.push({
                    name: '色散效果',
                    expected: '色散现象明显',
                    actual: result.message,
                    correct: result.hasDispersion
                });
                if (!result.hasDispersion) {
                    lensResults[lensIndex].allCorrect = false;
                    markFailure('noDispersion', lensIndex);
                }
            });
        }

        // 10. 低色散效果（逐片检查）
        if (validation.checkLowDispersion) {
            activeLenses.forEach((lens, lensIndex) => {
                const result = this.checkLowDispersion(lens);
                lensResults[lensIndex].items.push({
                    name: '低色散效果',
                    expected: '色散很小',
                    actual: result.message,
                    correct: result.lowDispersion
                });
                if (!result.lowDispersion) {
                    lensResults[lensIndex].allCorrect = false;
                    markFailure('highDispersion', lensIndex);
                }
            });
        }

        // 11. 球差现象（逐片检查）
        if (validation.checkSphericalAberration) {
            activeLenses.forEach((lens, lensIndex) => {
                const result = this.checkSphericalAberration(lens);
                lensResults[lensIndex].items.push({
                    name: '球差现象',
                    expected: '存在明显球差',
                    actual: result.message,
                    correct: result.hasAberration
                });
                if (!result.hasAberration) {
                    lensResults[lensIndex].allCorrect = false;
                    markFailure('noAberration', lensIndex);
                }
            });
        }

        // 12. 消球差效果（逐片检查）
        if (validation.checkNoSphericalAberration) {
            activeLenses.forEach((lens, lensIndex) => {
                const result = this.checkNoSphericalAberration(lens);
                lensResults[lensIndex].items.push({
                    name: '消球差效果',
                    expected: '球差被消除',
                    actual: result.message,
                    correct: result.noAberration
                });
                if (!result.noAberration) {
                    lensResults[lensIndex].allCorrect = false;
                    markFailure('hasAberration', lensIndex);
                }
            });
        }

        // 放在画布上但没有被光线穿过的透镜：不参与判定，仅列出提示
        const activeIds = new Set(activeLenses.map(l => l.id));
        const inactiveLenses = allLenses
            .filter(lens => !activeIds.has(lens.id))
            .map(lens => ({
                name: lens.getTypeName(),
                material: lens.getMaterialName()
            }));

        let earnedScore = 0;
        if (isCorrect) {
            earnedScore = this.hintUsed ? 5 : 10;
            this.score += earnedScore;
        }
        this.totalQuestions++;

        let explanation = question.explanation[explanationKey];
        if (!explanation) {
            explanation = question.explanation.correct;
        }
        if (explanationOverride) {
            explanation = explanationOverride + explanation;
        }
        if (inactiveLenses.length > 0) {
            const names = inactiveLenses.map(l => l.name).join('、');
            explanation += `（另外画布上的 ${names} 不在光路上，未参与判定。）`;
        }

        this.questionHistory.push({
            questionId: question.id,
            title: question.title,
            isCorrect: isCorrect,
            score: earnedScore,
            hintUsed: this.hintUsed,
            timestamp: Date.now()
        });

        return {
            isCorrect: isCorrect,
            score: earnedScore,
            totalScore: this.score,
            totalQuestions: this.totalQuestions,
            explanation: explanation,
            details: { lensResults, globalItems, inactiveLenses },
            hintUsed: this.hintUsed
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
