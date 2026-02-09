from django import forms
from .models import BusinessUser

class BusinessUserForm(forms.ModelForm):
    class Meta:
        model = BusinessUser
        fields = ['name', 'email', 'phone', 'business_type', 'crowd_intensity', 'latitude', 'longitude']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Enter your name'}),
            'email': forms.EmailInput(attrs={'class': 'form-control', 'placeholder': 'Enter your email'}),
            'phone': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Enter your phone number'}),
            'business_type': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Type of business'}),
            'crowd_intensity': forms.Select(attrs={'class': 'form-control'}),
            'latitude': forms.HiddenInput(),
            'longitude': forms.HiddenInput(),
        }
