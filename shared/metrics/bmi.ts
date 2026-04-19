export function bmi(kg: number, heightCm: number): number {
    const m = heightCm / 100;
    return kg / (m * m);
}

export function bmiCategory(value: number): string {
    if (value < 18.5) return "underweight";
    if (value < 25) return "normal";
    if (value < 30) return "overweight";
    return "obese";
}
