from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('submit-form/', views.submit_form, name='submit_form'),
    path('search-location/', views.search_location, name='search_location'),
    path('find-popular-places/', views.find_popular_places, name='find_popular_places'),
    path('analyze-crowd-intensity/', views.analyze_crowd_intensity, name='analyze_crowd_intensity'),
]
