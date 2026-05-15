import { Component, OnInit, OnDestroy, ViewChild, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService, TestItem, PriceDTO } from '../../services/api.service';
import { environment } from '../../../environments/environment';

export interface ExtractedTest {
  raw: string;
  matched: TestItem | null;
  prices: PriceDTO[];
  loading: boolean;
  expanded: boolean;
}

type Step = 'choose' | 'upload' | 'camera' | 'analyzing' | 'results' | 'error' | 'sent' | 'payment';

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
  @ViewChild('cameraInput') cameraInputEl!: ElementRef<HTMLInputElement>;

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

  // ─── User details for prescription notification ───────────────────────────
  userName = '';
  userPhone = '';
  sending = false;
  nameError = '';
  phoneError = '';

  // ─── Razorpay payment ─────────────────────────────────────────────────────
  paymentAmount = 99;          // ₹99 consultation / prescription review fee
  paymentSuccess = false;
  paymentOrderId = '';
  paymentPaymentId = '';

  constructor(private api: ApiService, private router: Router, private zone: NgZone) {}

  ngOnInit() {
    this.api.getTests().subscribe(t => { this.allTests = t; });
  }

  ngOnDestroy() { this.stopCamera(); }

  selectUpload() { this.step = 'upload'; }

  selectCamera() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      setTimeout(() => this.cameraInputEl?.nativeElement.click(), 100);
    } else {
      this.step = 'camera';
      this.cameraReady = false;
      this.cameraError = '';
      setTimeout(() => this.startCamera(), 100);
    }
  }

  onCameraFileCaptured(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    this.selectedFile = file;
    this.capturedDataUrl = null;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.zone.run(() => {
        this.previewUrl = e.target?.result as string;
        this.step = 'upload';
      });
    };
    reader.readAsDataURL(file);
    input.value = '';
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

  // ─── Validate user details form ───────────────────────────────────────────
  validateForm(): boolean {
    this.nameError = '';
    this.phoneError = '';
    let valid = true;

    if (!this.userName.trim()) {
      this.nameError = 'Please enter your name';
      valid = false;
    }

    if (!this.userPhone.trim()) {
      this.phoneError = 'Please enter your phone number';
      valid = false;
    } else if (!/^[6-9]\d{9}$/.test(this.userPhone.trim())) {
      this.phoneError = 'Please enter a valid 10-digit phone number';
      valid = false;
    }

    return valid;
  }

  // ─── Step 1: validate → create Razorpay order → open checkout ───────────
  async initiatePayment() {
    if (!this.validateForm()) return;
    if (!this.canAnalyze()) return;

    this.sending = true;

    try {
      // Ask backend to create a Razorpay order
      const orderRes = await fetch(`${environment.apiUrl}/razorpay/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName:  this.userName.trim(),
          userPhone: this.userPhone.trim(),
          amount:    this.paymentAmount
        })
      });

      if (!orderRes.ok) throw new Error('Could not create payment order');
      const order = await orderRes.json();

      // Load Razorpay checkout script dynamically if not already loaded
      await this.loadRazorpayScript();

      const options: any = {
        key:         order['key'],
        amount:      order['amount'],          // in paise, returned by backend
        currency:    'INR',
        name:        'LabChain',
        description: 'Prescription Review Fee',
        order_id:    order['id'],
        prefill: {
          name:    this.userName.trim(),
          contact: this.userPhone.trim()
        },
        theme: { color: '#6c63ff' },

        handler: (response: any) => {
          // Razorpay calls this on successful payment
          this.zone.run(() => {
            this.paymentOrderId   = response.razorpay_order_id;
            this.paymentPaymentId = response.razorpay_payment_id;
            this.handlePaymentSuccess(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            );
          });
        },
        modal: {
          ondismiss: () => {
            this.zone.run(() => { this.sending = false; });
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();

    } catch (err: any) {
      this.zone.run(() => {
        this.showError('Could not open payment. Please try again or call us directly.');
        this.sending = false;
      });
    }
  }

  // ─── Step 2: verify signature on backend → send team email ───────────────
  private async handlePaymentSuccess(orderId: string, paymentId: string, signature: string) {
    try {
      // Build test list from extracted tests (if any), else send empty
      const testNames = this.extractedTests
        .filter(et => et.matched !== null)
        .map(et => et.matched!.name);

      const verifyRes = await fetch(`${environment.apiUrl}/razorpay/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id:   orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature:  signature,
          userName:  this.userName.trim(),
          userPhone: this.userPhone.trim(),
          tests:     testNames,
          amount:    this.paymentAmount
        })
      });

      const result = await verifyRes.json();

      if (!verifyRes.ok || !result.success) {
        throw new Error(result.message || 'Payment verification failed');
      }

      // Payment verified + email sent → show success screen
      this.paymentSuccess = true;
      this.step = 'sent';

    } catch (err: any) {
      this.showError('Payment done but verification failed. Please contact support with Payment ID: ' + paymentId);
    } finally {
      this.sending = false;
    }
  }

  // ─── Load Razorpay JS SDK once ────────────────────────────────────────────
  private loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).Razorpay) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload  = () => resolve();
      script.onerror = () => reject(new Error('Razorpay script failed to load'));
      document.body.appendChild(script);
    });
  }

  // ─── Keep old sendToTeam as alias (used by template buttons) ─────────────
  sendToTeam() { this.initiatePayment(); }

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
        canvas.toBlob(b => { resolve(b!); }, 'image/jpeg', 0.80);
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

  goBack() {
    this.stopCamera();
    if (this.step === 'results' || this.step === 'error' || this.step === 'sent') {
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
    this.userName = '';
    this.userPhone = '';
    this.nameError = '';
    this.phoneError = '';
    this.sending = false;
    this.paymentSuccess = false;
    this.paymentOrderId = '';
    this.paymentPaymentId = '';
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
}