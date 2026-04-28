import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface Lab { id: number; name: string; city: string; address: string; phone: string; rating: number; accreditation: string; homeCollection: boolean; }
export interface TestItem { id: number; name: string; category: string; description: string; }
export interface PriceDTO { id: number; labId: number; labName: string; labCity: string; labAccreditation: string; labRating: number; testId: number; testName: string; testCategory: string; price: number; discountPercent: number; effectivePrice: number; reportDuration: string; }
export interface BookingDTO { id: number; bookingRef: string; patientName: string; patientAge: number; phone: string; email: string; labName: string; testName: string; testPrice: number; collectionFee: number; totalAmount: number; collectionType: string; collectionAddress: string; appointmentDate: string; appointmentSlot: string; paymentMethod: string; status: string; createdAt: string; }
export interface BookingRequest { patientName: string; patientAge: number; phone: string; email: string; labId: number; testId: number; collectionType: string; collectionAddress?: string; appointmentDate: string; appointmentSlot: string; paymentMethod: string; }
export interface ApiResp<T> { success: boolean; message: string; data: T; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;
  constructor(private http: HttpClient) {}
  private u<T>(o: Observable<ApiResp<T>>): Observable<T> { return o.pipe(map(r => r.data)); }

  getLabs(): Observable<Lab[]> { return this.u(this.http.get<ApiResp<Lab[]>>(`${this.base}/labs`)); }
  createLab(b: any): Observable<Lab> { return this.u(this.http.post<ApiResp<Lab>>(`${this.base}/labs`, b)); }
  updateLab(id: number, b: any): Observable<Lab> { return this.u(this.http.put<ApiResp<Lab>>(`${this.base}/labs/${id}`, b)); }
  deleteLab(id: number): Observable<any> { return this.http.delete(`${this.base}/labs/${id}`); }

  getTests(search?: string, category?: string): Observable<TestItem[]> {
    let p = new HttpParams();
    if (search) p = p.set('search', search);
    if (category) p = p.set('category', category);
    return this.u(this.http.get<ApiResp<TestItem[]>>(`${this.base}/tests`, { params: p }));
  }
  createTest(b: any): Observable<TestItem> { return this.u(this.http.post<ApiResp<TestItem>>(`${this.base}/tests`, b)); }
  updateTest(id: number, b: any): Observable<TestItem> { return this.u(this.http.put<ApiResp<TestItem>>(`${this.base}/tests/${id}`, b)); }
  deleteTest(id: number): Observable<any> { return this.http.delete(`${this.base}/tests/${id}`); }

  searchPrices(testId?: number, city?: string): Observable<PriceDTO[]> {
    let p = new HttpParams();
    if (testId) p = p.set('testId', testId.toString());
    if (city) p = p.set('city', city);
    return this.u(this.http.get<ApiResp<PriceDTO[]>>(`${this.base}/prices`, { params: p }));
  }
  getAllPrices(): Observable<PriceDTO[]> { return this.u(this.http.get<ApiResp<PriceDTO[]>>(`${this.base}/prices/all`)); }
  setPrice(b: any): Observable<PriceDTO> { return this.u(this.http.post<ApiResp<PriceDTO>>(`${this.base}/prices`, b)); }
  deletePrice(id: number): Observable<any> { return this.http.delete(`${this.base}/prices/${id}`); }

  createBooking(b: BookingRequest): Observable<BookingDTO> { return this.u(this.http.post<ApiResp<BookingDTO>>(`${this.base}/bookings`, b)); }
  getBookingByRef(ref: string): Observable<BookingDTO> { return this.u(this.http.get<ApiResp<BookingDTO>>(`${this.base}/bookings/${ref}`)); }
  getBookingQR(ref: string): Observable<{qrBase64: string}> { return this.u(this.http.get<ApiResp<{qrBase64: string}>>(`${this.base}/bookings/${ref}/qr`)); }
  getBookingsByPhone(phone: string): Observable<BookingDTO[]> { return this.u(this.http.get<ApiResp<BookingDTO[]>>(`${this.base}/bookings`, { params: new HttpParams().set('phone', phone) })); }
  getAllBookings(): Observable<BookingDTO[]> { return this.u(this.http.get<ApiResp<BookingDTO[]>>(`${this.base}/bookings`)); }
  cancelBooking(ref: string): Observable<BookingDTO> { return this.u(this.http.patch<ApiResp<BookingDTO>>(`${this.base}/bookings/${ref}/cancel`, {})); }
}
