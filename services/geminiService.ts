
import { ReportData, SideEffectAdvice, UKBLifestyleProfile } from "../types";

// Helper to convert file to base64
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const analyzeMedicalReport = async (base64Image: string, mimeType: string): Promise<ReportData> => {
  // Simulate network delay for AI effect
  await new Promise(resolve => setTimeout(resolve, 2000));

  const mimePrefix = mimeType === 'image/png' ? 'data:image/png;base64,' : 'data:image/jpeg;base64,';

  // Return mock data
  return {
    id: Date.now().toString(),
    metrics: {
      "WBC": 4.5,
      "RBC": 4.0,
      "HGB": 120,
      "PLT": 150,
      "CEA": 3.2
    },
    reportType: 'LAB',
    summary: "各项指标基本正常，肿瘤标志物未见明显异常升高。",
    clinicalAnalysis: "### AI 辅助解读\n\n根据上传的化验单，您的白细胞(WBC)、红细胞(RBC)、血红蛋白(HGB)和血小板(PLT)均在正常参考范围内。肿瘤标志物癌胚抗原(CEA)水平为3.2 ng/mL，处于正常水平。\n\n**建议：**\n- 继续保持当前的生活方式和治疗方案。\n- 定期复查，如有不适请及时就诊。\n\n*注：此为AI辅助分析结果，不能替代专业医生的诊断。*",
    date: new Date().toISOString().split('T')[0],
    imageUrl: `${mimePrefix}${base64Image}`
  };
};

export const getDrugSideEffectAdvice = async (drugName: string, reportedSymptoms: string[]): Promise<SideEffectAdvice[]> => {
  // Simulate network delay for AI effect
  await new Promise(resolve => setTimeout(resolve, 1500));

  const mockAdvice: SideEffectAdvice[] = reportedSymptoms.map(symptom => {
    let severity: "Mild" | "Moderate" | "Severe" = "Mild";
    let careGuide = `针对您提到的“${symptom}”，这可能是服用${drugName}后的常见反应。建议多休息，保持清淡饮食。`;
    let seekDoctor = false;

    if (symptom.includes("痛") || symptom.includes("热") || symptom.includes("发烧")) {
      severity = "Moderate";
      careGuide = `“${symptom}”需要引起注意。建议您测量体温，如果持续不缓解，请及时联系主治医生。`;
      seekDoctor = true;
    } else if (symptom.includes("呼吸") || symptom.includes("血")) {
      severity = "Severe";
      careGuide = `“${symptom}”属于较严重的症状，请立即停止活动，保持呼吸道通畅，并尽快前往医院就诊！`;
      seekDoctor = true;
    }

    return {
      symptom,
      severity,
      careGuide,
      seekDoctor
    };
  });

  return mockAdvice;
};

export const generateLifestyleReport = async (profile: UKBLifestyleProfile, currentTreatment: string, patientName: string): Promise<string> => {
    // Simulate network delay for AI effect
    await new Promise(resolve => setTimeout(resolve, 2500));

    return `### 专属健康改善建议：致 ${patientName}

您好！结合您的UKB生活方式数据和当前的治疗方案（${currentTreatment}），AI为您生成了以下专属健康建议：

**1. 戒烟与呼吸管理**
${profile.smokingStatus === 2 ? "我们注意到您目前仍在吸烟。为了您的肺部健康和治疗效果，**强烈建议您尽快戒烟**。这不仅能减轻肺部负担，还能显著提高治疗的有效率。" : "很高兴看到您保持着良好的不吸烟习惯，请继续保持！"}
针对您偶尔的呼吸不畅，建议每天进行10-15分钟的深呼吸练习（如腹式呼吸）。

**2. 睡眠优化**
您目前的睡眠时长为 ${profile.sleepDuration} 小时，睡眠质量评分为 ${profile.sleepQualityScore}/10。
建议您睡前避免使用电子产品，可以尝试听一些舒缓的音乐或进行简单的冥想，帮助提高睡眠质量。

**3. 适度运动**
根据您的运动水平，建议您每周进行3-5次，每次20-30分钟的轻中度有氧运动（如散步、太极拳）。请根据自身体力情况量力而行，避免过度劳累。

**4. 营养均衡**
您每天摄入 ${profile.fruitIntake} 份水果，建议继续保持多吃新鲜蔬菜和水果的习惯，保证充足的维生素和膳食纤维摄入。

*祝您早日康复，生活愉快！*`;
};

