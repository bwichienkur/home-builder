import {Component,type ErrorInfo,type ReactNode} from 'react';

export class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return{failed:true}}
 componentDidCatch(error:Error,info:ErrorInfo){console.error('Mahnikka UI error',error,info)}
 render(){return this.state.failed?<main className="app-error"><h1>Mahnikka needs to recover</h1><p>Your saved project is still available. Reload the builder to continue.</p><button onClick={()=>window.location.reload()}>Reload builder</button></main>:this.props.children}
}
