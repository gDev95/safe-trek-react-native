import React, { Component } from 'react'
import { observer, inject } from 'mobx-react/native'
import axios from 'axios'
import {Linking} from 'react-native'
// store
import { LocalStorage } from '../../store/localStorage'
// custom models
import Settings from '../../models/Settings'
import {SafeTrekToken} from '../../models/Auth'
import Geolocation from '../../models/Geolocation'
// custom components
import Login from '../Login'
import AlarmButton from '../AlarmButton'
import SettingsControls from '../Settings'
// styled Components
import StyledView from './StyledView'
// custom functions that do not set state
import shareAlarm from '../../functions/shareAlarm'
// import secrets, keys and ids
import {SafeTrekClientId, SafeTrekClientSecret} from '../../../secrets.js'

interface Props {
  localStorage?: LocalStorage
}

interface State {
  facebookToken: string,
  geolocation: Geolocation
  settings: Settings,
  safeTrekToken: SafeTrekToken,
  alarmCreated: boolean

}
@inject('localStorage')
@observer
export default class SafeTrek extends Component<Props, State> {
  constructor(props) {
    super(props)
    this.state = {
      facebookToken : '',
      geolocation: {
        latitude: 0,
        longitude: 0
      },
      settings: {
        shareLocation: false
      },
      safeTrekToken: {
        accessToken: '',
        refreshToken: ''
      },
      alarmCreated: false
    }
  }
  componentDidMount () {
    
    Linking.getInitialURL().then((uri) => {
      // get SafeTrek's access and refresh token from store
      this.props.localStorage.getToken('SafeTrekToken')
      .then((token) => {
        if (token) {
          this.setState({safeTrekToken: token})
          // get Settings from store
          this.props.localStorage.getSettings()
          .then((savedSettings) => {
            if   (savedSettings) {
              this.setState({settings: savedSettings})
            }
          })
        } else {
          if (uri) {
            const authCode = uri.substring(uri.indexOf('=') + 1, uri.indexOf('&'))
            const data = {
              'grant_type': 'authorization_code',
              'code': authCode,
              'client_id': SafeTrekClientId,
              'client_secret': SafeTrekClientSecret,
              'redirect_uri': 'safetrekfb://callback'
            }
            axios.post('https://login-sandbox.safetrek.io/oauth/token', data)
            .then(response => {
              const responseData = response.data
              // Token Type is bearer
              const accessToken = responseData.access_token
              const refreshToken = responseData.refresh_token
              // set Token in store and set token in state
              this.props.localStorage.setToken({accessToken, refreshToken}, 'SafeTrekToken').then(() => {
                this.setState({
                  safeTrekToken: { 
                    accessToken: accessToken, 
                    refreshToken: refreshToken 
                  }
                })
                // load settings from store
                this.props.localStorage.getSettings()
                .then((savedSettings) => {
                  if (savedSettings) {
                    this.setState({settings: savedSettings})
                  }
                })
              })

            })
            .catch(error => console.log('Error retrieving accessToken: ', error))

          } else if (this.state.safeTrekToken.accessToken.length <= 0) {
            // if not SafeTrek token is stored redirect user to authorize app
            let url = `https://account-sandbox.safetrek.io/authorize?audience=https://api-sandbox.safetrek.io&client_id=${SafeTrekClientId}&scope=openid+phone+offline_access&response_type=code&redirect_uri=safetrekfb://callback`
            Linking.openURL(url).catch(err => console.error('An error occurred', err))
          }
        }
      })
      .catch(error => console.log(error))
        }). catch (error => console.log('Error occured: ' + error))

  }
  updateSafeTrekToken = (): void => {
    const data = {
      'grant_type': 'refresh_token',
      'client_id': SafeTrekClientId,
      'client_secret': SafeTrekClientSecret,
      'refresh_token': this.state.safeTrekToken.refreshToken 
    }
    axios.post('https://login-sandbox.safetrek.io/oauth/token', data)
    .then((response) => {
      const responseData = response.data
      const accessToken = responseData.access_token
      const refreshToken = responseData.refresh_token
      const createdAt = new Date()
      this.props.localStorage.setToken({ 
        accessToken: accessToken,
        refreshToken: refreshToken,
        createdAt: createdAt
      },
      'SafeTrekToken')
      .then(() => {
        this.setState({
          safeTrekToken: { 
            accessToken: accessToken, 
            refreshToken: refreshToken 
          }
        })
      })
      
    })
  }
  updateFacebookToken = (token: string): void => {
    this.setState({facebookToken: token})
  }
  triggerAlarm = (): void => {
    // double check that the app was authorized
    if(this.state.safeTrekToken.accessToken.length <= 0) { 
      alert('Please make sure to authorize Safe Treks service for the App.\n Close the app and try again!')
   }
   navigator.geolocation.getCurrentPosition(
    (position) => {
    this.setState({
      geolocation: {latitude: position.coords.latitude, longitude: position.coords.longitude}
    })
    const config = {
      headers:{ 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${this.state.safeTrekToken.accessToken}`
      }
    }
    const data = {
      "services": {
            "police": true,
            "fire": false,
            "medical": false
          },
          "location.coordinates": {
            "lat": this.state.geolocation.latitude,
            "lng": this.state.geolocation.longitude,
            "accuracy": 10
          }
    }      
    axios.post('https://api-sandbox.safetrek.io/v1/alarms',data, config)
    .then(() => {
      if(this.state.settings.shareLocation){
        shareAlarm(this.state.geolocation)
      }
      else {
        shareAlarm()
      }
      this.setState({alarmCreated: true})
      })
    .catch(error => {
        alert('There was a problem with sending the Alarm.\n' + error.message)
      })
    },
    (error) => alert('error: ' + error.message),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
    )
  }
  updateLocationSharing = (): void => {
    this.setState({settings: {shareLocation: !this.state.settings.shareLocation}}, () => {
      this.props.localStorage.updateSettings(this.state.settings).then(() => {
        this.props.localStorage.getSettings()
        .then((savedSettings) => {
          if (savedSettings) {
            this.setState({settings: savedSettings})
          } 
        })
        .catch(e => alert(e))
       })
    })
  }

  render() {

    return (
      <StyledView alarmCreated={this.state.alarmCreated}>
        {
          (this.state.facebookToken.length <= 0 )
          ? <Login
            accessToken={this.state.facebookToken}
            onTokenUpdate={this.updateFacebookToken}/>
          : <AlarmButton onAlarmTriggered={this.triggerAlarm} />
        }
        <SettingsControls shareLocation={this.state.settings.shareLocation} onChange={this.updateLocationSharing}/>
      </StyledView>
    )
  }
}
