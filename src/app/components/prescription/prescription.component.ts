import { Component, OnInit, OnDestroy, ViewChild, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService, TestItem, PriceDTO } from '../../services/api.service';

export interface ExtractedTest {
  raw: string;
  matched: TestItem | null;
  prices: PriceDTO[];
  loading: boolean;
  expanded: boolean;
}

type Step = 'choose' | 'upload' | 'camera' | 'analyzing' | 'results' | 'error';

@Component({
  selector: 'app-prescription',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './prescription.component.html',
  styleUrl: './prescription.component.scss'
})
export class PrescriptionComponent implements OnInit, OnDestroy {

  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fileInput') fileInputEl!: ElementRef<HTMLInputElement>;

  step: Step = 'choose';
  dragOver = false;
  selectedFile: File | null = null;
  capturedDataUrl: string | null = null;
  previewUrl: string | null = null;
  stream: MediaStream | null = null;
  cameraReady = false;
  cameraError = '';
  extractedTests: ExtractedTest[] = [];
  doctorNotes = '';
  cityFilter = '';
  sortBy = 'price-asc';
  errorMsg = '';
  analysisProgress = '';
  allTests: TestItem[] = [];

  constructor(private api: ApiService, private router: Router, private zone: NgZone) {}

  ngOnInit() {
    this.api.getTests().subscribe(t => { this.allTests = t; });
  }

  ngOnDestroy() { this.stopCamera(); }

  selectUpload() { this.step = 'upload'; }

  selectCamera() {
    this.step = 'camera';
    this.cameraReady = false;
    this.cameraError = '';
    setTimeout(() => this.startCamera(), 100);
  }

  onDragOver(e: DragEvent) { e.preventDefault(); this.dragOver = true; }
  onDragLeave() { this.dragOver = false; }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) { this.setFile(file); }
  }

  onFileSelected(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) { this.setFile(file); }
  }

  setFile(file: File) {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      this.showError('Please upload an image file (JPG, PNG, WEBP) or PDF.');
      return;
    }
    this.selectedFile = file;
    this.capturedDataUrl = null;
    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => this.zone.run(() => { this.previewUrl = reader.result as string; });
      reader.readAsDataURL(file);
    } else {
      this.previewUrl = null;
    }
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
      const vid = this.videoEl?.nativeElement;
      if (vid) {
        vid.srcObject = this.stream;
        await vid.play();
        this.zone.run(() => { this.cameraReady = true; });
      }
    } catch (err: any) {
      this.zone.run(() => {
        this.cameraError = err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please use Upload instead.'
          : 'Could not access camera. Please use Upload instead.';
      });
    }
  }

  capturePhoto() {
    const vid = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    canvas.width = vid.videoWidth || 1280;
    canvas.height = vid.videoHeight || 720;
    canvas.getContext('2d')!.drawImage(vid, 0, 0, canvas.width, canvas.height);
    this.capturedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    this.previewUrl = this.capturedDataUrl;
    this.selectedFile = null;
    this.stopCamera();
  }

  retakePhoto() {
    this.capturedDataUrl = null;
    this.previewUrl = null;
    this.cameraReady = false;
    this.cameraError = '';
    setTimeout(() => this.startCamera(), 100);
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  canAnalyze(): boolean {
    return !!(this.selectedFile || this.capturedDataUrl);
  }

  async analyzePrescription() {
    if (!this.canAnalyze()) { return; }
    this.stopCamera();
    this.step = 'analyzing';
    this.analysisProgress = 'Compressing image...';

    try {
      const extractedText = await this.runOCR();
      console.log('=== OCR RAW TEXT ===\n' + extractedText + '\n===================');

      if (!extractedText || extractedText.trim().length < 3) {
        this.showError('Could not read any text. Please try a clearer photo.');
        return;
      }

      this.analysisProgress = 'Matching tests from database...';

      // ── DYNAMIC MATCHING — uses whatever is in the database ──────────────
      const matched = this.dynamicMatch(extractedText);

      console.log('Matched tests:', matched.map(t => t.name));

      if (matched.length === 0) {
        this.showError('No lab tests found. Raw text: "' + extractedText.substring(0, 200) + '"');
        return;
      }

      this.doctorNotes = this.extractNotes(extractedText);
      this.extractedTests = matched.map(test => ({
        raw: test.name,
        matched: test,
        prices: [],
        loading: true,
        expanded: true
      }));

      this.step = 'results';
      this.analysisProgress = '';

      for (const et of this.extractedTests) {
        if (et.matched) {
          this.api.searchPrices(et.matched.id, this.cityFilter || undefined).subscribe({
            next: p => this.zone.run(() => { et.prices = p; et.loading = false; }),
            error: () => this.zone.run(() => { et.loading = false; })
          });
        }
      }

    } catch (err: any) {
      this.showError(err?.message || 'Analysis failed. Please try again.');
    }
  }

  // ── CORE: Dynamic matching against DB tests ────────────────────────────────
  // This reads ALL tests from the database and tries to find them in OCR text.
  // No hardcoding — add a test to DB and it automatically works here.
  private dynamicMatch(ocrText: string): TestItem[] {
    const fullText = ocrText.toLowerCase();
    const matched: TestItem[] = [];
    const foundIds = new Set<number>();

    for (const test of this.allTests) {
      if (foundIds.has(test.id)) { continue; }

      const testNameLower = test.name.toLowerCase();

      // Strategy 1: exact full name match
      if (fullText.includes(testNameLower)) {
        matched.push(test);
        foundIds.add(test.id);
        continue;
      }

      // Strategy 2: match the base name (without brackets)
      const baseName = testNameLower.replace(/\(.*?\)/g, '').trim();
      if (baseName.length > 2 && fullText.includes(baseName)) {
        matched.push(test);
        foundIds.add(test.id);
        continue;
      }

      // Strategy 3: match abbreviation in brackets e.g. "(CBC)" "(LFT)"
      const abbrevMatch = test.name.match(/\(([^)]+)\)/);
      if (abbrevMatch) {
        const abbrev = abbrevMatch[1].toLowerCase();
        if (abbrev.length >= 2 && fullText.includes(abbrev)) {
          matched.push(test);
          foundIds.add(test.id);
          continue;
        }
      }

      // Strategy 4: category keyword match
      const category = test.category.toLowerCase();
      if (category.length > 3 && fullText.includes(category)) {
        // Only match on category if it's specific enough
        const specificCategories = ['thyroid', 'dengue', 'radiology', 'pathology'];
        if (specificCategories.includes(category)) {
          matched.push(test);
          foundIds.add(test.id);
          continue;
        }
      }

      // Strategy 5: smart keyword matching using alias map
      const aliases = this.getAliases(test.name);
      for (const alias of aliases) {
        if (alias.length >= 3 && fullText.includes(alias)) {
          matched.push(test);
          foundIds.add(test.id);
          break;
        }
      }
    }

    return matched;
  }

  // ── Alias map — common abbreviations and OCR misreads per test name ────────
  // Only needed for cases where the test name itself won't be found in OCR text.
  // Add new tests to DB — their names will auto-match via Strategy 1-3 above.
  // Only add aliases here for special abbreviations or OCR misread patterns.
  private getAliases(testName: string): string[] {
    const name = testName.toLowerCase();

    // CBC
    if (name.includes('complete blood') || name.includes('cbc')) {
      return ['cbc', 'cbp', 'haemogram', 'hemogram', 'haemoglobin', 'hemoglobin', 'complete blood count'];
    }
    // Thyroid
    if (name.includes('thyroid')) {
      return ['thyroid', 'tft', 'tsh', 't3', 't4', 'tyrode', 'thyro', 'thyroid profile'];
    }
    // LFT
    if (name.includes('liver')) {
      return ['lft', 'liver function', 'sgot', 'sgpt', 'bilirubin', 'liver func'];
    }
    // KFT
    if (name.includes('kidney')) {
      return ['kft', 'rft', 'kidney function', 'renal function', 'creatinine', 'kidney func'];
    }
    // Lipid
    if (name.includes('lipid')) {
      return ['lipid', 'cholesterol', 'triglyceride', 'lipid profile', 'hdl', 'ldl'];
    }
    // HbA1c / Diabetes
    if (name.includes('hba1c') || name.includes('diabetes')) {
      return ['hba1c', 'hb a1c', 'glycated', 'glycosylated', 'hbaic', 'hbalc', 'blood sugar', 'fasting'];
    }
    // Vitamin D
    if (name.includes('vitamin d')) {
      return ['vitamin d', 'vit d', 'vitd', '25-oh', '25 oh', 'vit. d'];
    }
    // Vitamin B12
    if (name.includes('vitamin b12') || name.includes('b12')) {
      return ['vitamin b12', 'vit b12', 'b12', 'b12 level', 'cyanocobalamin'];
    }
    // Urine
    if (name.includes('urine')) {
      return ['urine', 'urine routine', 'urine r/m', 'urine rm', 'urinalysis', 'urin', 'usin'];
    }
    // Dengue
    if (name.includes('dengue')) {
      return ['dengue', 'ns1', 'dengue ns1', 'dengu'];
    }
    // COVID
    if (name.includes('covid') || name.includes('rt-pcr')) {
      return ['covid', 'rt-pcr', 'rtpcr', 'sars-cov', 'corona'];
    }
    // Brain MRI
    if (name.includes('brain') && name.includes('mri')) {
      return ['mri brain', 'brain mri', 'mri of brain', 'brain mri plain', 'mri head'];
    }
    // Bone Marrow
    if (name.includes('bone marrow')) {
      return ['bone marrow', 'bone marrow examination', 'bone marrow biopsy', 'marrow examination', 'bma', 'bmt'];
    }
    // ESR
    if (name.includes('esr')) {
      return ['esr', 'erythrocyte sedimentation', 'sedimentation rate'];
    }
    // ECG
    if (name.includes('ecg') || name.includes('electrocardiogram')) {
      return ['ecg', 'ekg', 'electrocardiogram', 'echocardiogram'];
    }
    // X-Ray
    if (name.includes('x-ray') || name.includes('xray')) {
      return ['x-ray', 'xray', 'x ray', 'radiograph'];
    }
    // CT Scan
    if (name.includes('ct scan') || name.includes('ct')) {
      return ['ct scan', 'ct', 'computed tomography', 'cat scan'];
    }
    // Ultrasound
    if (name.includes('ultrasound')) {
      return ['ultrasound', 'usg', 'sonography', 'ultrasonography'];
    }

    // Default — return words from test name as keywords
    return name.split(/[\s\/\(\)]+/).filter(w => w.length > 3);
  }

  private extractNotes(ocrText: string): string {
    const notePatterns: RegExp[] = [
      /dr\.?\s+[a-z\s]+/i,
      /hospital/i,
      /clinic/i,
      /date[\s:]+[\d\/\-]+/i,
    ];
    const lines = ocrText.split(/[\n\r]+/);
    const noteLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 2 && notePatterns.some(p => p.test(trimmed))) {
        noteLines.push(trimmed);
        if (noteLines.length >= 2) { break; }
      }
    }
    return noteLines.join(' | ');
  }

  private async runOCR(): Promise<string> {
    const formData = new FormData();

    if (this.capturedDataUrl) {
      const res = await fetch(this.capturedDataUrl);
      const blob = await res.blob();
      const compressed = await this.compressBlob(blob);
      formData.append('file', compressed, 'prescription.jpg');
    } else if (this.selectedFile) {
      if (this.selectedFile.type.startsWith('image/')) {
        const dataUrl = await this.toDataUrl(this.selectedFile);
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const compressed = await this.compressBlob(blob);
        formData.append('file', compressed, this.selectedFile.name);
      } else {
        formData.append('file', this.selectedFile, this.selectedFile.name);
      }
    }

    this.analysisProgress = 'Reading prescription with OCR...';

    const response = await fetch('http://localhost:8080/api/prescription/ocr', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error('OCR error ' + response.status + ': ' + errText);
    }

    const data = await response.json();

    if (data.IsErroredOnProcessing) {
      throw new Error('OCR error: ' + (data.ErrorMessage?.[0] || 'Processing failed'));
    }

    return (data.ParsedResults || []).map((r: any) => r.ParsedText || '').join('\n');
  }

  private compressBlob(blob: Blob): Promise<Blob> {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        const maxW = 1200;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => { resolve(b!); }, 'image/jpeg', 0.75);
      };
      img.src = url;
    });
  }

  private toDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => { resolve(reader.result as string); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  onCityChange() {
    for (const et of this.extractedTests) {
      if (et.matched) {
        et.loading = true;
        this.api.searchPrices(et.matched.id, this.cityFilter || undefined).subscribe({
          next: p => this.zone.run(() => { et.prices = p; et.loading = false; }),
          error: () => this.zone.run(() => { et.loading = false; })
        });
      }
    }
  }

  goBack() {
    this.stopCamera();
    if (this.step === 'results' || this.step === 'error') {
      this.reset();
    } else {
      this.step = 'choose';
      this.selectedFile = null;
      this.capturedDataUrl = null;
      this.previewUrl = null;
      this.cameraReady = false;
      this.cameraError = '';
    }
  }

  reset() {
    this.stopCamera();
    this.step = 'choose';
    this.selectedFile = null;
    this.capturedDataUrl = null;
    this.previewUrl = null;
    this.extractedTests = [];
    this.errorMsg = '';
    this.doctorNotes = '';
    this.cameraReady = false;
    this.cameraError = '';
  }

  private showError(msg: string) {
    this.errorMsg = msg;
    this.step = 'error';
  }

  sortedPrices(prices: PriceDTO[]): PriceDTO[] {
    const p = [...prices];
    if (this.sortBy === 'price-asc')  { return p.sort((a, b) => a.effectivePrice - b.effectivePrice); }
    if (this.sortBy === 'price-desc') { return p.sort((a, b) => b.effectivePrice - a.effectivePrice); }
    if (this.sortBy === 'rating')     { return p.sort((a, b) => b.labRating - a.labRating); }
    return p.sort((a, b) => a.labName.localeCompare(b.labName));
  }

  lowestPrice(prices: PriceDTO[]): number {
    if (!prices || prices.length === 0) { return 0; }
    return Math.min(...prices.map(p => p.effectivePrice));
  }

  get matchedCount(): number {
    return this.extractedTests.filter(et => et.matched !== null).length;
  }

  get totalMinCost(): number {
    let total = 0;
    for (const et of this.extractedTests) {
      if (et.prices.length > 0) { total += this.lowestPrice(et.prices); }
    }
    return total;
  }

  getInitials(name: string): string {
    return name.split(' ').filter(Boolean).map((w: string) => w[0].toUpperCase()).slice(0, 2).join('');
  }

  bookNow(price: PriceDTO) {
    this.router.navigate(['/book'], { state: { price: price } });
  }
}